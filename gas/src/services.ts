/**
 * Application/domain services layer.
 * 此層處理 domain 決策，repository 僅負責資料存取。
 */
class CaptchaService {
  constructor(private readonly config: AppConfig) {}

  verify(token: string, ip: string): ApiResult {
    // 未設定 secret 時視為略過驗證，交由部署策略控制是否允許。
    if (!this.config.turnstileSecret) return { success: true, result: '', skipped: true };
    try {
      const response = UrlFetchApp.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'post',
        payload: {
          secret: this.config.turnstileSecret,
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
        'error-codes': ['turnstile_fetch_failed']
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

      const quotaResult = this.repository.consumeClientQuota(clientCode);
      if (!quotaResult.success) return quotaResult;

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

          const quotaResult = this.repository.consumeClientQuota(clientCode);
          if (!quotaResult.success) return quotaResult;

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

    const authority = url.replace(/^https?:\/\//i, '').split(/[/?#]/, 1)[0];
    if (!authority || authority.includes('@')) return false;

    const host = this.extractHost_(authority);
    if (!host) return false;
    if (host === 'localhost') return true;
    if (this.isValidIpv4Host_(host)) return true;
    if (this.isValidIpv6Host_(host)) return true;
    return this.isValidDomainHost_(host);
  }

  private extractHost_(authority: string): string {
    if (/^\[[0-9a-f:]+\](?::\d+)?$/i.test(authority)) {
      const closingIndex = authority.indexOf(']');
      return authority.slice(0, closingIndex + 1);
    }

    const portMatch = authority.match(/^(.*):(\d+)$/);
    return portMatch ? portMatch[1] : authority;
  }

  private isValidIpv4Host_(host: string): boolean {
    const segments = host.split('.');
    if (segments.length !== 4) return false;

    return segments.every((segment) => {
      if (!/^\d{1,3}$/.test(segment)) return false;
      const value = Number(segment);
      return value >= 0 && value <= 255;
    });
  }

  private isValidIpv6Host_(host: string): boolean {
    return /^\[[0-9a-f:]+\]$/i.test(host);
  }

  private isValidDomainHost_(host: string): boolean {
    if (host.length > 253) return false;
    if (host.startsWith('.') || host.endsWith('.')) return false;
    if (host.includes('..')) return false;

    const labels = host.split('.');
    if (labels.length < 2) return false;

    if (!labels.every((label) => this.isValidDomainLabel_(label))) return false;

    const topLevelLabel = labels[labels.length - 1];
    return /[a-z]/i.test(topLevelLabel);
  }

  private isValidDomainLabel_(label: string): boolean {
    if (!label || label.length > 63) return false;
    if (label.startsWith('-') || label.endsWith('-')) return false;
    return /^[a-z0-9-]+$/i.test(label);
  }
}
