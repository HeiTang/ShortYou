/**
 * 從 GAS Script Properties 載入執行期設定。
 * 將預設值與邊界條件集中於此，避免業務服務層分散處理設定細節。
 */
class AppConfig {
  readonly shortLinksSheetName: string;
  readonly clientsSheetName: string;
  readonly auditLogsSheetName: string;
  readonly recaptchaSecret: string;
  readonly enforceCaptcha: boolean;
  readonly enforceAccessControl: boolean;
  readonly aliasPattern: RegExp;
  readonly maxUrlLength: number;
  readonly randomAliasInitialLength: number;
  readonly randomAliasMaxLength: number;
  readonly randomAliasTryPerLength: number;
  readonly defaultDailyQuota: number;
  readonly capabilityTokenLength: number;
  readonly publicSiteUrl: string;
  readonly reservedAliases: Set<string>;

  private constructor(props: GoogleAppsScript.Properties.Properties) {
    // 相容舊鍵名 SHORT_SHEET_NAME，並優先使用新鍵名 SHORT_LINKS_SHEET_NAME。
    const fallbackShort = AppConfig.textProp_(props, 'SHORT_SHEET_NAME', 'short_links');
    this.shortLinksSheetName = AppConfig.textProp_(props, 'SHORT_LINKS_SHEET_NAME', fallbackShort);
    this.clientsSheetName = AppConfig.textProp_(props, 'CLIENTS_SHEET_NAME', 'clients');
    this.auditLogsSheetName = AppConfig.textProp_(props, 'AUDIT_LOGS_SHEET_NAME', 'audit_logs');
    this.recaptchaSecret = AppConfig.textProp_(props, 'RECAPTCHA_SECRET', '');
    this.enforceCaptcha = AppConfig.boolProp_(props, 'ENFORCE_CAPTCHA', true);
    this.enforceAccessControl = AppConfig.boolProp_(props, 'ENFORCE_ACCESS_CONTROL', true);
    this.maxUrlLength = AppConfig.numProp_(props, 'MAX_URL_LENGTH', 2048, 128, 4096);
    this.randomAliasInitialLength = AppConfig.numProp_(
      props,
      'RANDOM_ALIAS_INITIAL_LENGTH',
      6,
      3,
      64
    );
    this.randomAliasMaxLength = AppConfig.numProp_(props, 'RANDOM_ALIAS_MAX_LENGTH', 12, 3, 64);
    this.randomAliasTryPerLength = AppConfig.numProp_(
      props,
      'RANDOM_ALIAS_TRY_PER_LENGTH',
      12,
      1,
      200
    );
    this.defaultDailyQuota = AppConfig.numProp_(props, 'DEFAULT_DAILY_QUOTA', 0, 0, 500000);
    this.capabilityTokenLength = AppConfig.numProp_(props, 'CAPABILITY_TOKEN_LENGTH', 64, 32, 256);
    this.publicSiteUrl = AppConfig.textProp_(props, 'PUBLIC_SITE_URL', 'https://t.purr.tw').replace(
      /\/$/,
      ''
    );
    this.aliasPattern = /^[a-z0-9_-]{3,32}$/;
    this.reservedAliases = new Set(
      AppConfig.textProp_(props, 'RESERVED_ALIASES', '')
        .split(',')
        .map((item) => InputNormalizer.alias(item))
        .filter((item) => item.length > 0)
    );
  }

  static load(): AppConfig {
    // 每次啟動以最新 Script Properties 建立設定物件。
    return new AppConfig(PropertiesService.getScriptProperties());
  }

  private static textProp_(
    props: GoogleAppsScript.Properties.Properties,
    key: string,
    fallback: string
  ): string {
    const value = props.getProperty(key);
    if (value === null || value === undefined) return fallback;
    return value.trim();
  }

  private static boolProp_(
    props: GoogleAppsScript.Properties.Properties,
    key: string,
    fallback: boolean
  ): boolean {
    const value = props.getProperty(key);
    if (value === null || value === undefined || value.trim() === '') return fallback;
    return value.trim().toLowerCase() === 'true';
  }

  private static numProp_(
    props: GoogleAppsScript.Properties.Properties,
    key: string,
    fallback: number,
    min: number,
    max: number
  ): number {
    const value = props.getProperty(key);
    if (value === null || value === undefined || value.trim() === '') return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(parsed)));
  }

  capabilityLink(capabilityToken: string): string {
    // 對外只發放首頁 token 入口，前端讀到 #t= 後切換為真實建立模式。
    return `${this.publicSiteUrl}/#t=${encodeURIComponent(capabilityToken)}`;
  }
}
