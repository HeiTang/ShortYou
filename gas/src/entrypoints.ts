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
const inviteService = new InviteService(sheetRepository);
// 單一 ApiController 負責整體 HTTP 請求分派。
const apiController = new ApiController(
  appConfig,
  sheetRepository,
  shortUrlService,
  captchaService,
  accessControlService,
  inviteService
);

function doGet(e: GoogleAppsScript.Events.DoGet): GoogleAppsScript.Content.TextOutput {
  return apiController.handleGet(e);
}

function doPost(e: GoogleAppsScript.Events.DoPost): GoogleAppsScript.Content.TextOutput {
  return apiController.handlePost(e);
}

function createInvite(
  inviteCode: string,
  maxUses: number,
  expiresAtIso: string,
  issuedBy: string,
  issuedToHint: string,
  note: string
): ApiResult {
  // 管理端輸入 invite code 只會儲存 hash，不保存明文。
  const normalizedInvite = InputNormalizer.text(inviteCode);
  if (!normalizedInvite) return { success: false, result: '', error: 'missing_invite_code' };
  const hash = DigestUtil.sha256Hex(normalizedInvite);
  return sheetRepository.withScriptLock(() => {
    sheetRepository.createInvite(
      hash,
      maxUses || 1,
      InputNormalizer.text(expiresAtIso),
      InputNormalizer.text(issuedBy),
      InputNormalizer.text(issuedToHint),
      InputNormalizer.text(note)
    );
    return { success: true, result: hash };
  });
}

function disableInvite(inviteCode: string): ApiResult {
  const normalizedInvite = InputNormalizer.text(inviteCode);
  if (!normalizedInvite) return { success: false, result: '', error: 'missing_invite_code' };
  const hash = DigestUtil.sha256Hex(normalizedInvite);
  return sheetRepository.withScriptLock(() => sheetRepository.disableInvite(hash));
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

/**
 * 舊版相容函式：保留既有巨集名稱，避免重構後手動流程失效。
 */
function create(inviteCode: string): GoogleAppsScript.Content.TextOutput {
  const result = createInvite(
    inviteCode,
    1,
    '',
    'legacy_create',
    '',
    'created by legacy create() wrapper'
  );
  return json_(result);
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
