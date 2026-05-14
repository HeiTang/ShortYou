/**
 * Application/domain services layer.
 * 此層處理 domain 決策，repository 僅負責資料存取。
 */
class CaptchaService {
  constructor(private readonly config: AppConfig) {}

  verify(token: string, ip: string): ApiResult {
    // 未設定 secret 時視為略過驗證，交由部署策略控制是否允許。
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

/** 建立短網址前的授權服務（capability token 驗證）。 */
class AccessControlService {
  constructor(private readonly repository: SheetRepository, private readonly config: AppConfig) {}

  authorizeCreate(capabilityToken: string): ApiResult {
    // 若關閉 access control，回傳匿名 client 以維持相容。
    if (!this.config.enforceAccessControl) return { success: true, result: 'anonymous', skipped: true };
    if (!capabilityToken) return { success: false, result: '', error: 'capability_token_required' };
    return this.repository.withScriptLock(() =>
      this.repository.authorizeClientByCapabilityToken(capabilityToken)
    );
  }
}

/** 邀請碼兌換服務（invite code -> capability token link）。 */
class InviteService {
  constructor(private readonly repository: SheetRepository) {}

  exchange(inviteCode: string, ownerName: string): ApiResult {
    const normalized = InputNormalizer.text(inviteCode);
    if (!normalized) return { success: false, result: '', error: 'missing_invite_code' };
    const hash = DigestUtil.sha256Hex(normalized);
    return this.repository.withScriptLock(() => this.repository.exchangeInvite(hash, ownerName));
  }
}

/** 短網址核心服務（查詢、建立、自訂別名、隨機別名）。 */
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
    // 有傳 alias 走自訂分支，否則走隨機別名分支。
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
      // 逐步拉長 alias 長度，降低碰撞時的無限重試風險。
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
    // 阻擋試算表常見公式注入起始字元。
    if (/^[=+\-@]/.test(url)) return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (_err) {
      return false;
    }
  }
}
