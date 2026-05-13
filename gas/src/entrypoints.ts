/**
 * GAS backend entrypoint composition.
 *
 * Source layout (SOLID/DRY split):
 * - types.ts: shared types/errors
 * - config.ts: AppConfig
 * - utils.ts: normalizer/date/hash/random helpers
 * - repository.ts: Sheets DAL
 * - services.ts: domain/application services
 * - controller.ts: HTTP controller
 * - entrypoints.ts: bootstrap + GAS global entrypoints + admin wrappers
 *
 * Build note:
 * TypeScript compiles all gas/src/*.ts into a single generated gas/Code.js via outFile.
 * Please edit source files under gas/src only.
 */

const appConfig = AppConfig.load();
const sheetRepository = new SheetRepository(appConfig);
sheetRepository.ensureSchema();

const shortUrlService = new ShortUrlService(sheetRepository, appConfig);
const captchaService = new CaptchaService(appConfig);
const accessControlService = new AccessControlService(sheetRepository, appConfig);
const inviteService = new InviteService(sheetRepository);
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
 * Legacy wrappers for old scripts/macros.
 * Keep names stable so existing manual ops still work after refactor.
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
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
