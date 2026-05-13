/**
 * Application/domain services layer.
 * Handles business rules while repository stays focused on Sheets IO details.
 */
class CaptchaService {
  constructor(private readonly config: AppConfig) {}

  verify(token: string, ip: string): ApiResult {
    if (!this.config.recaptchaSecret) return { success: true, result: '', skipped: true };
    try {
      const response = UrlFetchApp.fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'post',
        payload: {
          secret: this.config.recaptchaSecret,
          response: token,
          remoteip: ip || ''
        },
        muteHttpExceptions: true
      });
      const parsed = JSON.parse(response.getContentText()) as { success?: boolean; 'error-codes'?: string[] };
      if (parsed.success) return { success: true, result: '' };
      return {
        success: false,
        result: '',
        error: 'captcha_failed',
        'error-codes': parsed['error-codes'] || []
      };
    } catch (_err) {
      return {
        success: false,
        result: '',
        error: 'captcha_failed',
        'error-codes': ['recaptcha_fetch_failed']
      };
    }
  }
}

/** Authorization service for create API capability-token checks. */
class AccessControlService {
  constructor(private readonly repository: SheetRepository, private readonly config: AppConfig) {}

  authorizeCreate(capabilityToken: string): ApiResult {
    if (!this.config.enforceAccessControl) return { success: true, result: 'anonymous', skipped: true };
    if (!capabilityToken) return { success: false, result: '', error: 'capability_token_required' };
    return this.repository.withScriptLock(() =>
      this.repository.authorizeClientByCapabilityToken(capabilityToken)
    );
  }
}

/** Invite exchange flow service (invite code -> capability token link). */
class InviteService {
  constructor(private readonly repository: SheetRepository) {}

  exchange(inviteCode: string, ownerName: string): ApiResult {
    const normalized = InputNormalizer.text(inviteCode);
    if (!normalized) return { success: false, result: '', error: 'missing_invite_code' };
    const hash = DigestUtil.sha256Hex(normalized);
    return this.repository.withScriptLock(() => this.repository.exchangeInvite(hash, ownerName));
  }
}

/** Core short-url domain service (resolve/create/custom alias/random alias). */
class ShortUrlService {
  constructor(private readonly repository: SheetRepository, private readonly config: AppConfig) {}

  resolve(aliasInput: string): ApiResult {
    const alias = InputNormalizer.alias(aliasInput);
    if (!alias) return { success: false, result: '', error: 'missing_query' };

    const record = this.repository.getShortLink(alias);
    if (!record || !record.url) return { success: false, result: '', error: 'not_found' };
    if (record.status !== 'active') return { success: false, result: '', error: 'not_found' };

    this.repository.withScriptLock(() => {
      this.repository.incrementShortLinkClicks(record.row);
    });
    return { success: true, result: record.url };
  }

  create(urlInput: string, customAliasInput: string, clientCode: string): ApiResult {
    const url = InputNormalizer.text(urlInput);
    if (!url) return { success: false, result: '', error: 'missing_url' };
    if (!this.isValidUrl_(url)) return { success: false, result: '', error: 'invalid_url' };

    const rawAlias = InputNormalizer.text(customAliasInput);
    if (rawAlias) return this.createCustomAlias_(url, rawAlias, clientCode);
    return this.createRandomAlias_(url, clientCode);
  }

  private createCustomAlias_(url: string, rawAlias: string, clientCode: string): ApiResult {
    const normalizedAlias = InputNormalizer.alias(rawAlias);
    if (!this.config.aliasPattern.test(normalizedAlias)) {
      return { success: false, result: '', error: 'invalid_alias' };
    }
    if (this.config.reservedAliases.has(normalizedAlias)) {
      return { success: false, result: '', error: 'reserved_alias' };
    }

    return this.repository.withScriptLock(() => {
      if (this.repository.aliasExists(normalizedAlias)) {
        return { success: false, result: '', error: 'alias_exists' };
      }
      this.repository.appendShortLink(normalizedAlias, url, clientCode);
      return { success: true, result: normalizedAlias };
    });
  }

  private createRandomAlias_(url: string, clientCode: string): ApiResult {
    return this.repository.withScriptLock(() => {
      for (
        let length = this.config.randomAliasInitialLength;
        length <= this.config.randomAliasMaxLength;
        length += 1
      ) {
        for (let i = 0; i < this.config.randomAliasTryPerLength; i += 1) {
          const candidate = RandomUtil.randomAlias(length);
          if (this.repository.aliasExists(candidate)) continue;
          this.repository.appendShortLink(candidate, url, clientCode);
          return { success: true, result: candidate };
        }
      }
      return { success: false, result: '', error: 'alias_generation_failed' };
    });
  }

  private isValidUrl_(url: string): boolean {
    if (!/^https?:\/\/\S+$/i.test(url)) return false;
    if (url.length > this.config.maxUrlLength) return false;
    if (/^[=+\-@]/.test(url)) return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (_err) {
      return false;
    }
  }
}
