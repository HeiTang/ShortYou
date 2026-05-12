"use strict";
class InvalidJsonError extends Error {
    constructor() {
        super('invalid_json');
    }
}
class AppConfig {
    constructor(props) {
        this.shortSheetName = AppConfig.textProp_(props, 'SHORT_SHEET_NAME', 'short');
        this.clientsSheetName = AppConfig.textProp_(props, 'CLIENTS_SHEET_NAME', 'clients');
        this.recaptchaSecret = AppConfig.textProp_(props, 'RECAPTCHA_SECRET', '');
        this.enforceCaptcha = AppConfig.boolProp_(props, 'ENFORCE_CAPTCHA', true);
        this.enforceAccessControl = AppConfig.boolProp_(props, 'ENFORCE_ACCESS_CONTROL', true);
        this.maxUrlLength = AppConfig.numProp_(props, 'MAX_URL_LENGTH', 2048, 128, 4096);
        this.randomAliasInitialLength = AppConfig.numProp_(props, 'RANDOM_ALIAS_INITIAL_LENGTH', 6, 3, 64);
        this.randomAliasMaxLength = AppConfig.numProp_(props, 'RANDOM_ALIAS_MAX_LENGTH', 12, 3, 64);
        this.randomAliasTryPerLength = AppConfig.numProp_(props, 'RANDOM_ALIAS_TRY_PER_LENGTH', 12, 1, 200);
        this.aliasPattern = /^[a-z0-9_-]{3,32}$/;
        this.clientIdPattern = /^[A-Za-z0-9_-]{3,64}$/;
        this.reservedAliases = new Set(AppConfig.textProp_(props, 'RESERVED_ALIASES', '')
            .split(',')
            .map((item) => InputNormalizer.alias(item))
            .filter((item) => item.length > 0));
    }
    static load() {
        return new AppConfig(PropertiesService.getScriptProperties());
    }
    static textProp_(props, key, fallback) {
        const value = props.getProperty(key);
        if (value === null || value === undefined)
            return fallback;
        return value.trim();
    }
    static boolProp_(props, key, fallback) {
        const value = props.getProperty(key);
        if (value === null || value === undefined || value.trim() === '')
            return fallback;
        return value.trim().toLowerCase() === 'true';
    }
    static numProp_(props, key, fallback, min, max) {
        const value = props.getProperty(key);
        if (value === null || value === undefined || value.trim() === '')
            return fallback;
        const parsed = Number(value);
        if (!Number.isFinite(parsed))
            return fallback;
        return Math.min(max, Math.max(min, Math.floor(parsed)));
    }
}
class InputNormalizer {
    static text(value) {
        if (value === undefined || value === null)
            return '';
        const text = String(value).trim();
        if (text === 'undefined' || text === 'null')
            return '';
        return text;
    }
    static alias(value) {
        return InputNormalizer.text(value).toLowerCase();
    }
}
class DigestUtil {
    static sha256Hex(value) {
        const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
        return bytes.map((byte) => {
            const normalized = byte < 0 ? byte + 256 : byte;
            const hex = normalized.toString(16);
            return hex.length === 1 ? `0${hex}` : hex;
        }).join('');
    }
    static timingSafeEqual(a, b) {
        if (a.length !== b.length)
            return false;
        let mismatch = 0;
        for (let i = 0; i < a.length; i += 1) {
            mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
        }
        return mismatch === 0;
    }
}
class RandomAliasGenerator {
    static generate(length) {
        let output = '';
        for (let i = 0; i < length; i += 1) {
            output += RandomAliasGenerator.CHARS.charAt(Math.floor(Math.random() * RandomAliasGenerator.CHARS.length));
        }
        return output;
    }
}
RandomAliasGenerator.CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
class SheetRepository {
    constructor(config) {
        this.config = config;
    }
    withScriptLock(callback) {
        const lock = LockService.getScriptLock();
        lock.waitLock(5000);
        try {
            return callback();
        }
        finally {
            lock.releaseLock();
        }
    }
    getAliasRecord(alias) {
        const shortSheet = this.getShortSheet_();
        const row = this.findAliasRow_(shortSheet, alias);
        if (row === 0)
            return null;
        const url = InputNormalizer.text(shortSheet.getRange(row, SheetRepository.COL_URL).getValue());
        if (!url)
            return null;
        return { row, url };
    }
    incrementClicks(row) {
        const shortSheet = this.getShortSheet_();
        const clickRange = shortSheet.getRange(row, SheetRepository.COL_CLICKS);
        const current = Number(clickRange.getValue()) || 0;
        clickRange.setValue(current + 1);
    }
    aliasExists(alias) {
        const shortSheet = this.getShortSheet_();
        return this.findAliasRow_(shortSheet, alias) !== 0;
    }
    appendShortAlias(alias, url) {
        const shortSheet = this.getShortSheet_();
        shortSheet.appendRow([alias, url, 0]);
    }
    getClientById(clientId) {
        const clientsSheet = this.getClientsSheet_(true);
        const row = this.findClientRow_(clientsSheet, clientId);
        if (row === 0)
            return null;
        const apiKeyHash = InputNormalizer.text(clientsSheet.getRange(row, SheetRepository.CLIENT_COL_KEY_HASH).getValue());
        const status = InputNormalizer.text(clientsSheet.getRange(row, SheetRepository.CLIENT_COL_STATUS).getValue()).toLowerCase();
        const normalizedStatus = status || 'active';
        if (!apiKeyHash)
            return null;
        return {
            row,
            clientId,
            apiKeyHash,
            status: normalizedStatus
        };
    }
    upsertClient(clientId, apiKeyHash, status, note) {
        const clientsSheet = this.getClientsSheet_(false);
        const now = new Date().toISOString();
        return this.withScriptLock(() => {
            const row = this.findClientRow_(clientsSheet, clientId);
            if (row !== 0) {
                clientsSheet.getRange(row, SheetRepository.CLIENT_COL_KEY_HASH).setValue(apiKeyHash);
                clientsSheet.getRange(row, SheetRepository.CLIENT_COL_STATUS).setValue(status);
                clientsSheet.getRange(row, SheetRepository.CLIENT_COL_NOTE).setValue(note);
                clientsSheet.getRange(row, SheetRepository.CLIENT_COL_UPDATED_AT).setValue(now);
            }
            else {
                clientsSheet.appendRow([clientId, apiKeyHash, status, note, now]);
            }
            return { success: true, result: clientId };
        });
    }
    updateClientStatus(clientId, status) {
        const clientsSheet = this.getClientsSheet_(true);
        const row = this.findClientRow_(clientsSheet, clientId);
        if (row === 0)
            return { success: false, result: '', error: 'client_not_found' };
        const now = new Date().toISOString();
        return this.withScriptLock(() => {
            clientsSheet.getRange(row, SheetRepository.CLIENT_COL_STATUS).setValue(status);
            clientsSheet.getRange(row, SheetRepository.CLIENT_COL_UPDATED_AT).setValue(now);
            return { success: true, result: clientId };
        });
    }
    getShortSheet_() {
        const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(this.config.shortSheetName);
        if (!sheet)
            throw new Error(`Sheet not found: ${this.config.shortSheetName}`);
        return sheet;
    }
    getClientsSheet_(required) {
        const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
        const current = spreadsheet.getSheetByName(this.config.clientsSheetName);
        if (current)
            return current;
        if (required)
            throw new Error(`Sheet not found: ${this.config.clientsSheetName}`);
        const created = spreadsheet.insertSheet(this.config.clientsSheetName);
        created.appendRow(['client_id', 'api_key_hash', 'status', 'note', 'updated_at']);
        return created;
    }
    findAliasRow_(sheet, alias) {
        const lastRow = sheet.getLastRow();
        if (lastRow < 1)
            return 0;
        const values = sheet.getRange(1, SheetRepository.COL_ALIAS, lastRow, 1).getValues();
        const target = InputNormalizer.alias(alias);
        for (let i = 0; i < values.length; i += 1) {
            const current = InputNormalizer.alias(values[i][0]);
            if (current === target)
                return i + 1;
        }
        return 0;
    }
    findClientRow_(sheet, clientId) {
        const lastRow = sheet.getLastRow();
        if (lastRow < 1)
            return 0;
        const values = sheet.getRange(1, SheetRepository.CLIENT_COL_ID, lastRow, 1).getValues();
        const target = InputNormalizer.text(clientId);
        for (let i = 0; i < values.length; i += 1) {
            const current = InputNormalizer.text(values[i][0]);
            if (current === target)
                return i + 1;
        }
        return 0;
    }
}
SheetRepository.COL_ALIAS = 1;
SheetRepository.COL_URL = 2;
SheetRepository.COL_CLICKS = 3;
SheetRepository.CLIENT_COL_ID = 1;
SheetRepository.CLIENT_COL_KEY_HASH = 2;
SheetRepository.CLIENT_COL_STATUS = 3;
SheetRepository.CLIENT_COL_NOTE = 4;
SheetRepository.CLIENT_COL_UPDATED_AT = 5;
class CaptchaService {
    constructor(config) {
        this.config = config;
    }
    verify(token, ip) {
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
            const parsed = JSON.parse(response.getContentText());
            if (parsed.success)
                return { success: true, result: '' };
            return {
                success: false,
                result: '',
                error: 'captcha_failed',
                'error-codes': parsed['error-codes'] || []
            };
        }
        catch (_err) {
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
    constructor(repository, config) {
        this.repository = repository;
        this.config = config;
    }
    authorizeCreate(clientId, apiKey) {
        if (!this.config.enforceAccessControl)
            return { success: true, result: '', skipped: true };
        if (!clientId || !apiKey)
            return { success: false, result: '', error: 'client_auth_required' };
        let record = null;
        try {
            record = this.repository.getClientById(clientId);
        }
        catch (_err) {
            return { success: false, result: '', error: 'access_control_not_ready' };
        }
        if (!record)
            return { success: false, result: '', error: 'unauthorized_client' };
        if (record.status !== 'active')
            return { success: false, result: '', error: 'client_disabled' };
        const candidateHash = DigestUtil.sha256Hex(apiKey);
        if (!DigestUtil.timingSafeEqual(candidateHash, record.apiKeyHash)) {
            return { success: false, result: '', error: 'unauthorized_client' };
        }
        return { success: true, result: record.clientId };
    }
}
class ShortUrlService {
    constructor(repository, config) {
        this.repository = repository;
        this.config = config;
    }
    resolve(aliasInput) {
        const alias = InputNormalizer.alias(aliasInput);
        if (!alias)
            return { success: false, result: '', error: 'missing_query' };
        const record = this.repository.getAliasRecord(alias);
        if (!record)
            return { success: false, result: '', error: 'not_found' };
        this.repository.withScriptLock(() => {
            this.repository.incrementClicks(record.row);
        });
        return { success: true, result: record.url };
    }
    create(urlInput, customAliasInput) {
        const url = InputNormalizer.text(urlInput);
        if (!url)
            return { success: false, result: '', error: 'missing_url' };
        if (!this.isValidUrl_(url))
            return { success: false, result: '', error: 'invalid_url' };
        const rawAlias = InputNormalizer.text(customAliasInput);
        if (rawAlias)
            return this.createCustomAlias_(url, rawAlias);
        return this.createRandomAlias_(url);
    }
    createCustomAlias_(url, rawAlias) {
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
    createRandomAlias_(url) {
        return this.repository.withScriptLock(() => {
            for (let length = this.config.randomAliasInitialLength; length <= this.config.randomAliasMaxLength; length += 1) {
                for (let i = 0; i < this.config.randomAliasTryPerLength; i += 1) {
                    const candidate = RandomAliasGenerator.generate(length);
                    if (this.repository.aliasExists(candidate))
                        continue;
                    this.repository.appendShortAlias(candidate, url);
                    return { success: true, result: candidate };
                }
            }
            return { success: false, result: '', error: 'alias_generation_failed' };
        });
    }
    isValidUrl_(url) {
        if (!/^https?:\/\/\S+$/i.test(url))
            return false;
        if (url.length > this.config.maxUrlLength)
            return false;
        if (/^[=+\-@]/.test(url))
            return false; // Prevent formula injection in Sheets.
        try {
            const parsed = new URL(url);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        }
        catch (_err) {
            return false;
        }
    }
}
class ApiController {
    constructor(config, shortUrlService, captchaService, accessControlService) {
        this.config = config;
        this.shortUrlService = shortUrlService;
        this.captchaService = captchaService;
        this.accessControlService = accessControlService;
    }
    handleGet(e) {
        const alias = InputNormalizer.text((e && e.parameter && e.parameter.query) || '');
        return json_(this.shortUrlService.resolve(alias));
    }
    handlePost(e) {
        let payload;
        try {
            payload = this.parsePayload_(e);
        }
        catch (err) {
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
        if (!url)
            return json_({ success: false, result: '', error: 'missing_url' });
        if (this.config.recaptchaSecret) {
            if (this.config.enforceCaptcha && !token) {
                return json_({ success: false, result: '', error: 'captcha_required' });
            }
            if (token) {
                const verifyResult = this.captchaService.verify(token, ip);
                if (!verifyResult.success)
                    return json_(verifyResult);
            }
        }
        const accessResult = this.accessControlService.authorizeCreate(clientId, apiKey);
        if (!accessResult.success)
            return json_(accessResult);
        return json_(this.shortUrlService.create(url, alias));
    }
    parsePayload_(e) {
        const merged = {};
        const params = (e && e.parameter) || {};
        for (const key of Object.keys(params)) {
            merged[key] = params[key];
        }
        const raw = InputNormalizer.text(e && e.postData && e.postData.contents);
        const type = InputNormalizer.text(e && e.postData && e.postData.type).toLowerCase();
        if (!raw || !type.includes('application/json'))
            return merged;
        let parsed;
        try {
            parsed = JSON.parse(raw);
        }
        catch (_err) {
            throw new InvalidJsonError();
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new InvalidJsonError();
        }
        const parsedObj = parsed;
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
const apiController = new ApiController(appConfig, shortUrlService, captchaService, accessControlService);
function doGet(e) {
    return apiController.handleGet(e);
}
function doPost(e) {
    return apiController.handlePost(e);
}
// Compatibility wrappers
function query(s) {
    const data = shortUrlService.resolve(InputNormalizer.text(s));
    return data.success ? data.result : undefined;
}
function insert(url, alias) {
    const data = shortUrlService.create(InputNormalizer.text(url), InputNormalizer.text(alias));
    return data.success ? data.result : undefined;
}
function randomStr(m) {
    const length = Number(m);
    return RandomAliasGenerator.generate(Number.isFinite(length) ? Math.floor(length) : 15);
}
function asJSON(str) {
    return json_({ result: InputNormalizer.text(str) });
}
function hashApiKey(rawApiKey) {
    const value = InputNormalizer.text(rawApiKey);
    if (!value)
        throw new Error('apiKey is required');
    return DigestUtil.sha256Hex(value);
}
function upsertClient(clientIdRaw, apiKeyRaw, statusRaw, noteRaw) {
    const clientId = InputNormalizer.text(clientIdRaw);
    const apiKey = InputNormalizer.text(apiKeyRaw);
    const status = InputNormalizer.text(statusRaw).toLowerCase() || 'active';
    const note = InputNormalizer.text(noteRaw);
    if (!appConfig.clientIdPattern.test(clientId)) {
        return { success: false, result: '', error: 'invalid_client_id' };
    }
    if (!apiKey)
        return { success: false, result: '', error: 'invalid_api_key' };
    if (!['active', 'disabled'].includes(status)) {
        return { success: false, result: '', error: 'invalid_status' };
    }
    const hash = DigestUtil.sha256Hex(apiKey);
    return repository.upsertClient(clientId, hash, status, note);
}
function disableClient(clientIdRaw) {
    const clientId = InputNormalizer.text(clientIdRaw);
    if (!appConfig.clientIdPattern.test(clientId)) {
        return { success: false, result: '', error: 'invalid_client_id' };
    }
    return repository.updateClientStatus(clientId, 'disabled');
}
function rotateClientKey(clientIdRaw, newApiKeyRaw) {
    return upsertClient(clientIdRaw, newApiKeyRaw, 'active', 'rotated');
}
function json_(obj) {
    return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
