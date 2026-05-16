/**
 * GAS 後端進入點組裝。
 *
 * 原始碼分層：
 * - types.ts：共用型別與錯誤
 * - config.ts：AppConfig 設定載入
 * - utils.ts：正規化 / 日期 / 雜湊 / 隨機工具
 * - repository.ts：Sheet 資料存取層
 * - services.ts：業務規則層
 * - controller.ts：HTTP 控制器層
 * - entrypoints.ts：依賴組裝 + GAS 全域函式 + 管理包裝
 *
 * 建置說明：
 * - 以 scripts/build-gas.mjs 將 gas/src/*.ts 合併輸出為 gas/Code.js
 * - 請只編輯 gas/src，不要手改 gas/Code.js
 */

const RUNTIME_CONFIG_SIGNATURE_KEY = '__SHORTYOU_RUNTIME_CONFIG_SIGNATURE';
const RUNTIME_CONFIG_ENVIRONMENT_KEY = '__SHORTYOU_RUNTIME_CONFIG_ENVIRONMENT';
const RUNTIME_CONFIG_APPLIED_AT_KEY = '__SHORTYOU_RUNTIME_CONFIG_APPLIED_AT';

const SYNCABLE_SCRIPT_PROPERTY_KEYS = new Set([
  'TURNSTILE_SECRET',
  'ENFORCE_CAPTCHA',
  'ENFORCE_ACCESS_CONTROL',
  'PUBLIC_SITE_URL',
  'SHORT_LINKS_SHEET_NAME',
  'CLIENTS_SHEET_NAME',
  'AUDIT_LOGS_SHEET_NAME',
  'DEFAULT_DAILY_QUOTA',
  'RESERVED_ALIASES',
  'MAX_URL_LENGTH',
  'RANDOM_ALIAS_INITIAL_LENGTH',
  'RANDOM_ALIAS_MAX_LENGTH',
  'RANDOM_ALIAS_TRY_PER_LENGTH',
  'CAPABILITY_TOKEN_LENGTH'
]);

function applyPendingRuntimeConfig_(): void {
  const globalScope = globalThis as unknown as Record<string, unknown>;
  const rawPayload = globalScope.__SHORTYOU_PENDING_RUNTIME_CONFIG;

  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) return;

  const payload = rawPayload as Record<string, unknown>;
  const propertyMap = payload.propertyMap;
  if (!propertyMap || typeof propertyMap !== 'object' || Array.isArray(propertyMap)) return;

  const signature = InputNormalizer.text(payload.signature);
  const environment = InputNormalizer.text(payload.environment) || 'generated';
  const properties = PropertiesService.getScriptProperties();

  if (signature && properties.getProperty(RUNTIME_CONFIG_SIGNATURE_KEY) === signature) {
    return;
  }

  const applied = applyScriptProperties_(propertyMap as JsonObject);
  if (applied.unknownKeys.length > 0) {
    Logger.log(
      JSON.stringify({
        environment,
        error: 'unsupported_script_property',
        unknownKeys: applied.unknownKeys
      })
    );
    return;
  }

  if (signature) {
    properties.setProperty(RUNTIME_CONFIG_SIGNATURE_KEY, signature);
  }
  properties.setProperty(RUNTIME_CONFIG_ENVIRONMENT_KEY, environment);
  properties.setProperty(RUNTIME_CONFIG_APPLIED_AT_KEY, new Date().toISOString());

  Logger.log(
    JSON.stringify({
      environment,
      source: 'bootstrap',
      updatedKeys: applied.updatedKeys,
      deletedKeys: applied.deletedKeys,
      signature
    })
  );
}

applyPendingRuntimeConfig_();

const appConfig = AppConfig.load();
const sheetRepository = new SheetRepository(appConfig);
sheetRepository.ensureSchema();

const shortUrlService = new ShortUrlService(sheetRepository, appConfig);
const captchaService = new CaptchaService(appConfig);
const accessControlService = new AccessControlService(sheetRepository, appConfig);
// 單一 ApiController 負責整體 HTTP 請求分派。
const apiController = new ApiController(
  appConfig,
  sheetRepository,
  shortUrlService,
  captchaService,
  accessControlService
);

function applyScriptProperties_(propertyMap: JsonObject): {
  unknownKeys: string[];
  updatedKeys: string[];
  deletedKeys: string[];
} {
  const unknownKeys = Object.keys(propertyMap).filter((key) => !SYNCABLE_SCRIPT_PROPERTY_KEYS.has(key));
  const properties = PropertiesService.getScriptProperties();
  const updatedKeys: string[] = [];
  const deletedKeys: string[] = [];

  if (unknownKeys.length > 0) {
    return { unknownKeys, updatedKeys, deletedKeys };
  }

  for (const [key, rawValue] of Object.entries(propertyMap)) {
    if (rawValue === null || rawValue === undefined) {
      properties.deleteProperty(key);
      deletedKeys.push(key);
      continue;
    }

    const textValue = String(rawValue).trim();
    if (!textValue) {
      properties.deleteProperty(key);
      deletedKeys.push(key);
      continue;
    }

    properties.setProperty(key, textValue);
    updatedKeys.push(key);
  }

  return { unknownKeys, updatedKeys, deletedKeys };
}

function doGet(e: GoogleAppsScript.Events.DoGet): GoogleAppsScript.Content.TextOutput {
  return apiController.handleGet(e);
}

function doPost(e: GoogleAppsScript.Events.DoPost): GoogleAppsScript.Content.TextOutput {
  return apiController.handlePost(e);
}

function disableClient(clientCode: string): ApiResult {
  const normalizedCode = InputNormalizer.text(clientCode);
  if (!normalizedCode) return { success: false, result: '', error: 'missing_client_code' };
  return sheetRepository.withScriptLock(() => sheetRepository.disableClient(normalizedCode));
}

function rotateClientToken(clientCode: string): ApiResult {
  const normalizedCode = InputNormalizer.text(clientCode);
  if (!normalizedCode) return { success: false, result: '', error: 'missing_client_code' };
  return sheetRepository.withScriptLock(() => sheetRepository.rotateClientToken(normalizedCode));
}

function issueCapabilityLink(
  ownerName: string,
  expiresAtIso: string,
  dailyQuota: number,
  note: string
): ApiResult {
  const result = sheetRepository.withScriptLock(() =>
    sheetRepository.issueCapabilityLink(ownerName, expiresAtIso, dailyQuota, note)
  );

  // Apps Script 編輯器手動執行時，回傳值不一定會直接顯示；同步寫入執行記錄方便複製完整 link。
  Logger.log(JSON.stringify(result));
  return result;
}

function query(alias: string): GoogleAppsScript.Content.TextOutput {
  return json_(shortUrlService.resolve(alias));
}

function add(
  url: string,
  id: string,
  alias: string,
  token: string,
  ip: string
): GoogleAppsScript.Content.TextOutput {
  // 舊版 add() 參數 id 對應新版 capabilityToken。
  const payload: Record<string, unknown> = {
    url,
    alias,
    token,
    ip,
    capabilityToken: id
  };
  return apiController.handlePost({
    parameter: payload as Record<string, string>,
    postData: {
      contents: '',
      length: 0,
      name: '',
      type: ''
    }
  } as GoogleAppsScript.Events.DoPost);
}

function asJSON(text: string): GoogleAppsScript.Content.TextOutput {
  return json_({ result: text });
}

function syncRuntimeConfig(environment: string, propertyMap: JsonObject): ApiResult {
  const normalizedEnvironment = typeof environment === 'string' ? environment.trim() : '';
  if (!normalizedEnvironment) {
    return { success: false, result: '', error: 'missing_environment' };
  }
  if (!propertyMap || Array.isArray(propertyMap) || typeof propertyMap !== 'object') {
    return { success: false, result: '', error: 'invalid_property_map' };
  }

  const applied = applyScriptProperties_(propertyMap);
  if (applied.unknownKeys.length > 0) {
    return {
      success: false,
      result: '',
      error: 'unsupported_script_property',
      'error-codes': applied.unknownKeys
    };
  }

  const properties = PropertiesService.getScriptProperties();
  properties.setProperty(RUNTIME_CONFIG_ENVIRONMENT_KEY, normalizedEnvironment);
  properties.setProperty(RUNTIME_CONFIG_APPLIED_AT_KEY, new Date().toISOString());

  const summary = {
    environment: normalizedEnvironment,
    updatedKeys: applied.updatedKeys,
    deletedKeys: applied.deletedKeys
  };
  Logger.log(JSON.stringify(summary));
  return { success: true, result: JSON.stringify(summary) };
}

function getRuntimeConfigStatus(): ApiResult {
  const properties = PropertiesService.getScriptProperties();
  return {
    success: true,
    result: 'ok',
    environment: properties.getProperty(RUNTIME_CONFIG_ENVIRONMENT_KEY) || '',
    signature: properties.getProperty(RUNTIME_CONFIG_SIGNATURE_KEY) || '',
    appliedAt: properties.getProperty(RUNTIME_CONFIG_APPLIED_AT_KEY) || '',
    publicSiteUrl: properties.getProperty('PUBLIC_SITE_URL') || '',
    enforceCaptcha: properties.getProperty('ENFORCE_CAPTCHA') || '',
    enforceAccessControl: properties.getProperty('ENFORCE_ACCESS_CONTROL') || ''
  };
}

function upsertClient(
  clientCode: string,
  ownerName: string,
  capabilityToken: string,
  expiresAtIso: string,
  dailyQuota: number,
  note: string
): ApiResult {
  return sheetRepository.withScriptLock(() =>
    sheetRepository.upsertClient(clientCode, ownerName, capabilityToken, expiresAtIso, dailyQuota, note)
  );
}

function json_(obj: JsonObject | ApiResult): GoogleAppsScript.Content.TextOutput {
  // GAS 回應統一走 JSON，方便前端與腳本一致解析。
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
