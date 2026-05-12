type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

type ApiResult = {
  success: boolean;
  result: string;
  error?: string;
  skipped?: boolean;
  'error-codes'?: string[];
};

type ClientRecord = {
  row: number;
  clientId: string;
  apiKeyHash: string;
  status: string;
};

class InvalidJsonError extends Error {
  constructor() {
    super('invalid_json');
  }
}

class AppConfig {
  readonly shortSheetName: string;
  readonly clientsSheetName: string;
  readonly recaptchaSecret: string;
  readonly enforceCaptcha: boolean;
  readonly enforceAccessControl: boolean;
  readonly aliasPattern: RegExp;
  readonly clientIdPattern: RegExp;
  readonly maxUrlLength: number;
  readonly randomAliasInitialLength: number;
  readonly randomAliasMaxLength: number;
  readonly randomAliasTryPerLength: number;
  readonly reservedAliases: Set<string>;

  private constructor(props: GoogleAppsScript.Properties.Properties) {
    this.shortSheetName = AppConfig.textProp_(props, 'SHORT_SHEET_NAME', 'short');
    this.clientsSheetName = AppConfig.textProp_(props, 'CLIENTS_SHEET_NAME', 'clients');
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
    this.aliasPattern = /^[a-z0-9_-]{3,32}$/;
    this.clientIdPattern = /^[A-Za-z0-9_-]{3,64}$/;
    this.reservedAliases = new Set(
      AppConfig.textProp_(props, 'RESERVED_ALIASES', '')
        .split(',')
        .map((item) => InputNormalizer.alias(item))
        .filter((item) => item.length > 0)
    );
  }

  static load(): AppConfig {
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
}

class InputNormalizer {
  static text(value: unknown): string {
    if (value === undefined || value === null) return '';
    const text = String(value).trim();
    if (text === 'undefined' || text === 'null') return '';
    return text;
  }

  static alias(value: unknown): string {
    return InputNormalizer.text(value).toLowerCase();
  }
}

class DigestUtil {
  static sha256Hex(value: string): string {
    const bytes = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      value,
      Utilities.Charset.UTF_8
    );
    return bytes.map((byte) => {
      const normalized = byte < 0 ? byte + 256 : byte;
      const hex = normalized.toString(16);
      return hex.length === 1 ? `0${hex}` : hex;
    }).join('');
  }

  static timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let mismatch = 0;
    for (let i = 0; i < a.length; i += 1) {
      mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return mismatch === 0;
  }
}

class RandomAliasGenerator {
  private static readonly CHARS =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  static generate(length: number): string {
    let output = '';
    for (let i = 0; i < length; i += 1) {
      output += RandomAliasGenerator.CHARS.charAt(
        Math.floor(Math.random() * RandomAliasGenerator.CHARS.length)
      );
    }
    return output;
  }
}

class SheetRepository {
  private static readonly COL_ALIAS = 1;
  private static readonly COL_URL = 2;
  private static readonly COL_CLICKS = 3;

  private static readonly CLIENT_COL_ID = 1;
  private static readonly CLIENT_COL_KEY_HASH = 2;
  private static readonly CLIENT_COL_STATUS = 3;
  private static readonly CLIENT_COL_NOTE = 4;
  private static readonly CLIENT_COL_UPDATED_AT = 5;

  constructor(private readonly config: AppConfig) {}

  withScriptLock<T>(callback: () => T): T {
    const lock = LockService.getScriptLock();
    lock.waitLock(5000);
    try {
      return callback();
    } finally {
      lock.releaseLock();
    }
  }

  getAliasRecord(alias: string): { row: number; url: string } | null {
    const shortSheet = this.getShortSheet_();
    const row = this.findAliasRow_(shortSheet, alias);
    if (row === 0) return null;
    const url = InputNormalizer.text(shortSheet.getRange(row, SheetRepository.COL_URL).getValue());
    if (!url) return null;
    return { row, url };
  }

  incrementClicks(row: number): void {
    const shortSheet = this.getShortSheet_();
    const clickRange = shortSheet.getRange(row, SheetRepository.COL_CLICKS);
    const current = Number(clickRange.getValue()) || 0;
    clickRange.setValue(current + 1);
  }

  aliasExists(alias: string): boolean {
    const shortSheet = this.getShortSheet_();
    return this.findAliasRow_(shortSheet, alias) !== 0;
  }

  appendShortAlias(alias: string, url: string): void {
    const shortSheet = this.getShortSheet_();
    shortSheet.appendRow([alias, url, 0]);
  }

  getClientById(clientId: string): ClientRecord | null {
    const clientsSheet = this.getClientsSheet_(true);
    const row = this.findClientRow_(clientsSheet, clientId);
    if (row === 0) return null;

    const apiKeyHash = InputNormalizer.text(
      clientsSheet.getRange(row, SheetRepository.CLIENT_COL_KEY_HASH).getValue()
    );
    const status = InputNormalizer.text(
      clientsSheet.getRange(row, SheetRepository.CLIENT_COL_STATUS).getValue()
    ).toLowerCase();
    const normalizedStatus = status || 'active';

    if (!apiKeyHash) return null;
    return {
      row,
      clientId,
      apiKeyHash,
      status: normalizedStatus
    };
  }

  upsertClient(clientId: string, apiKeyHash: string, status: string, note: string): ApiResult {
    const clientsSheet = this.getClientsSheet_(false);
    const now = new Date().toISOString();

    return this.withScriptLock(() => {
      const row = this.findClientRow_(clientsSheet, clientId);
      if (row !== 0) {
        clientsSheet.getRange(row, SheetRepository.CLIENT_COL_KEY_HASH).setValue(apiKeyHash);
        clientsSheet.getRange(row, SheetRepository.CLIENT_COL_STATUS).setValue(status);
        clientsSheet.getRange(row, SheetRepository.CLIENT_COL_NOTE).setValue(note);
        clientsSheet.getRange(row, SheetRepository.CLIENT_COL_UPDATED_AT).setValue(now);
      } else {
        clientsSheet.appendRow([clientId, apiKeyHash, status, note, now]);
      }

      return { success: true, result: clientId };
    });
  }

  updateClientStatus(clientId: string, status: string): ApiResult {
    const clientsSheet = this.getClientsSheet_(true);
    const row = this.findClientRow_(clientsSheet, clientId);
    if (row === 0) return { success: false, result: '', error: 'client_not_found' };

    const now = new Date().toISOString();
    return this.withScriptLock(() => {
      clientsSheet.getRange(row, SheetRepository.CLIENT_COL_STATUS).setValue(status);
      clientsSheet.getRange(row, SheetRepository.CLIENT_COL_UPDATED_AT).setValue(now);
      return { success: true, result: clientId };
    });
  }

  private getShortSheet_(): GoogleAppsScript.Spreadsheet.Sheet {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(this.config.shortSheetName);
    if (!sheet) throw new Error(`Sheet not found: ${this.config.shortSheetName}`);
    return sheet;
  }

  private getClientsSheet_(required: boolean): GoogleAppsScript.Spreadsheet.Sheet {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const current = spreadsheet.getSheetByName(this.config.clientsSheetName);

    if (current) return current;
    if (required) throw new Error(`Sheet not found: ${this.config.clientsSheetName}`);

    const created = spreadsheet.insertSheet(this.config.clientsSheetName);
    created.appendRow(['client_id', 'api_key_hash', 'status', 'note', 'updated_at']);
    return created;
  }

  private findAliasRow_(sheet: GoogleAppsScript.Spreadsheet.Sheet, alias: string): number {
    const lastRow = sheet.getLastRow();
    if (lastRow < 1) return 0;
    const values = sheet.getRange(1, SheetRepository.COL_ALIAS, lastRow, 1).getValues();
    const target = InputNormalizer.alias(alias);
    for (let i = 0; i < values.length; i += 1) {
      const current = InputNormalizer.alias(values[i][0]);
      if (current === target) return i + 1;
    }
    return 0;
  }

  private findClientRow_(sheet: GoogleAppsScript.Spreadsheet.Sheet, clientId: string): number {
    const lastRow = sheet.getLastRow();
    if (lastRow < 1) return 0;
    const values = sheet.getRange(1, SheetRepository.CLIENT_COL_ID, lastRow, 1).getValues();
    const target = InputNormalizer.text(clientId);
    for (let i = 0; i < values.length; i += 1) {
      const current = InputNormalizer.text(values[i][0]);
      if (current === target) return i + 1;
    }
    return 0;
  }
}

class CaptchaService {
  constructor(private readonly config: AppConfig) {}

  verify(token: string, ip: string): ApiResult {
    if (!this.config.recaptchaSecret) {
      return { success: true, result: '', skipped: true };
    }

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

class AccessControlService {
  constructor(private readonly repository: SheetRepository, private readonly config: AppConfig) {}

  authorizeCreate(clientId: string, apiKey: string): ApiResult {
    if (!this.config.enforceAccessControl) return { success: true, result: '', skipped: true };
    if (!clientId || !apiKey) return { success: false, result: '', error: 'client_auth_required' };

    let record: ClientRecord | null = null;
    try {
      record = this.repository.getClientById(clientId);
    } catch (_err) {
      return { success: false, result: '', error: 'access_control_not_ready' };
    }

    if (!record) return { success: false, result: '', error: 'unauthorized_client' };
    if (record.status !== 'active') return { success: false, result: '', error: 'client_disabled' };

    const candidateHash = DigestUtil.sha256Hex(apiKey);
    if (!DigestUtil.timingSafeEqual(candidateHash, record.apiKeyHash)) {
      return { success: false, result: '', error: 'unauthorized_client' };
    }

    return { success: true, result: record.clientId };
  }
}

class ShortUrlService {
  constructor(private readonly repository: SheetRepository, private readonly config: AppConfig) {}

  resolve(aliasInput: string): ApiResult {
    const alias = InputNormalizer.alias(aliasInput);
    if (!alias) return { success: false, result: '', error: 'missing_query' };

    const record = this.repository.getAliasRecord(alias);
    if (!record) return { success: false, result: '', error: 'not_found' };

    this.repository.withScriptLock(() => {
      this.repository.incrementClicks(record.row);
    });

    return { success: true, result: record.url };
  }

  create(urlInput: string, customAliasInput: string): ApiResult {
    const url = InputNormalizer.text(urlInput);
    if (!url) return { success: false, result: '', error: 'missing_url' };
    if (!this.isValidUrl_(url)) return { success: false, result: '', error: 'invalid_url' };

    const rawAlias = InputNormalizer.text(customAliasInput);
    if (rawAlias) return this.createCustomAlias_(url, rawAlias);

    return this.createRandomAlias_(url);
  }

  private createCustomAlias_(url: string, rawAlias: string): ApiResult {
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
      this.repository.appendShortAlias(normalizedAlias, url);
      return { success: true, result: normalizedAlias };
    });
  }

  private createRandomAlias_(url: string): ApiResult {
    return this.repository.withScriptLock(() => {
      for (
        let length = this.config.randomAliasInitialLength;
        length <= this.config.randomAliasMaxLength;
        length += 1
      ) {
        for (let i = 0; i < this.config.randomAliasTryPerLength; i += 1) {
          const candidate = RandomAliasGenerator.generate(length);
          if (this.repository.aliasExists(candidate)) continue;
          this.repository.appendShortAlias(candidate, url);
          return { success: true, result: candidate };
        }
      }
      return { success: false, result: '', error: 'alias_generation_failed' };
    });
  }

  private isValidUrl_(url: string): boolean {
    if (!/^https?:\/\/\S+$/i.test(url)) return false;
    if (url.length > this.config.maxUrlLength) return false;
    if (/^[=+\-@]/.test(url)) return false; // Prevent formula injection in Sheets.

    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (_err) {
      return false;
    }
  }
}

class ApiController {
  constructor(
    private readonly config: AppConfig,
    private readonly shortUrlService: ShortUrlService,
    private readonly captchaService: CaptchaService,
    private readonly accessControlService: AccessControlService
  ) {}

  handleGet(e: GoogleAppsScript.Events.DoGet): GoogleAppsScript.Content.TextOutput {
    const alias = InputNormalizer.text((e && e.parameter && e.parameter.query) || '');
    return json_(this.shortUrlService.resolve(alias));
  }

  handlePost(e: GoogleAppsScript.Events.DoPost): GoogleAppsScript.Content.TextOutput {
    let payload: Record<string, unknown>;
    try {
      payload = this.parsePayload_(e);
    } catch (err) {
      if (err instanceof InvalidJsonError) {
        return json_({ success: false, result: '', error: 'invalid_json' });
      }
      throw err;
    }

    const url = InputNormalizer.text(payload.url);
    const alias = InputNormalizer.text(payload.alias);
    const token = InputNormalizer.text(payload.token);
    const ip = InputNormalizer.text(payload.ip);
    const clientId = InputNormalizer.text(payload.clientId);
    const apiKey = InputNormalizer.text(payload.apiKey);

    if (token && !url) {
      return json_(this.captchaService.verify(token, ip));
    }
    if (!url) return json_({ success: false, result: '', error: 'missing_url' });

    if (this.config.recaptchaSecret) {
      if (this.config.enforceCaptcha && !token) {
        return json_({ success: false, result: '', error: 'captcha_required' });
      }
      if (token) {
        const verifyResult = this.captchaService.verify(token, ip);
        if (!verifyResult.success) return json_(verifyResult);
      }
    }

    const accessResult = this.accessControlService.authorizeCreate(clientId, apiKey);
    if (!accessResult.success) return json_(accessResult);

    return json_(this.shortUrlService.create(url, alias));
  }

  private parsePayload_(e: GoogleAppsScript.Events.DoPost): Record<string, unknown> {
    const merged: Record<string, unknown> = {};
    const params = (e && e.parameter) || {};
    for (const key of Object.keys(params)) {
      merged[key] = params[key];
    }

    const raw = InputNormalizer.text(e && e.postData && e.postData.contents);
    const type = InputNormalizer.text(e && e.postData && e.postData.type).toLowerCase();
    if (!raw || !type.includes('application/json')) return merged;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (_err) {
      throw new InvalidJsonError();
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new InvalidJsonError();
    }

    const parsedObj = parsed as Record<string, unknown>;
    for (const key of Object.keys(parsedObj)) {
      merged[key] = parsedObj[key];
    }
    return merged;
  }
}

const appConfig = AppConfig.load();
const repository = new SheetRepository(appConfig);
const shortUrlService = new ShortUrlService(repository, appConfig);
const captchaService = new CaptchaService(appConfig);
const accessControlService = new AccessControlService(repository, appConfig);
const apiController = new ApiController(
  appConfig,
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

// Compatibility wrappers
function query(s: unknown): string | undefined {
  const data = shortUrlService.resolve(InputNormalizer.text(s));
  return data.success ? data.result : undefined;
}

function insert(url: unknown, alias: unknown): string | undefined {
  const data = shortUrlService.create(InputNormalizer.text(url), InputNormalizer.text(alias));
  return data.success ? data.result : undefined;
}

function randomStr(m: unknown): string {
  const length = Number(m);
  return RandomAliasGenerator.generate(Number.isFinite(length) ? Math.floor(length) : 15);
}

function asJSON(str: unknown): GoogleAppsScript.Content.TextOutput {
  return json_({ result: InputNormalizer.text(str) });
}

function hashApiKey(rawApiKey: unknown): string {
  const value = InputNormalizer.text(rawApiKey);
  if (!value) throw new Error('apiKey is required');
  return DigestUtil.sha256Hex(value);
}

function upsertClient(
  clientIdRaw: unknown,
  apiKeyRaw: unknown,
  statusRaw: unknown,
  noteRaw: unknown
): ApiResult {
  const clientId = InputNormalizer.text(clientIdRaw);
  const apiKey = InputNormalizer.text(apiKeyRaw);
  const status = InputNormalizer.text(statusRaw).toLowerCase() || 'active';
  const note = InputNormalizer.text(noteRaw);

  if (!appConfig.clientIdPattern.test(clientId)) {
    return { success: false, result: '', error: 'invalid_client_id' };
  }
  if (!apiKey) return { success: false, result: '', error: 'invalid_api_key' };
  if (!['active', 'disabled'].includes(status)) {
    return { success: false, result: '', error: 'invalid_status' };
  }

  const hash = DigestUtil.sha256Hex(apiKey);
  return repository.upsertClient(clientId, hash, status, note);
}

function disableClient(clientIdRaw: unknown): ApiResult {
  const clientId = InputNormalizer.text(clientIdRaw);
  if (!appConfig.clientIdPattern.test(clientId)) {
    return { success: false, result: '', error: 'invalid_client_id' };
  }
  return repository.updateClientStatus(clientId, 'disabled');
}

function rotateClientKey(clientIdRaw: unknown, newApiKeyRaw: unknown): ApiResult {
  return upsertClient(clientIdRaw, newApiKeyRaw, 'active', 'rotated');
}

function json_(obj: JsonObject | ApiResult): GoogleAppsScript.Content.TextOutput {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
