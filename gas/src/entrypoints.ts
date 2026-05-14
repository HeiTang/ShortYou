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
  return sheetRepository.withScriptLock(() =>
    sheetRepository.issueCapabilityLink(ownerName, expiresAtIso, dailyQuota, note)
  );
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
