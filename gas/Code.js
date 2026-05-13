"use strict";
class InvalidJsonError extends Error {
    constructor() {
        super('invalid_json');
    }
}
/**
 * Runtime config loader from GAS Script Properties.
 * Centralizes defaults and guardrails so services stay focused on domain logic.
 */
class AppConfig {
    constructor(props) {
        const fallbackShort = AppConfig.textProp_(props, 'SHORT_SHEET_NAME', 'short_links');
        this.shortLinksSheetName = AppConfig.textProp_(props, 'SHORT_LINKS_SHEET_NAME', fallbackShort);
        this.clientsSheetName = AppConfig.textProp_(props, 'CLIENTS_SHEET_NAME', 'clients');
        this.invitesSheetName = AppConfig.textProp_(props, 'INVITES_SHEET_NAME', 'invites');
        this.auditLogsSheetName = AppConfig.textProp_(props, 'AUDIT_LOGS_SHEET_NAME', 'audit_logs');
        this.recaptchaSecret = AppConfig.textProp_(props, 'RECAPTCHA_SECRET', '');
        this.enforceCaptcha = AppConfig.boolProp_(props, 'ENFORCE_CAPTCHA', true);
        this.enforceAccessControl = AppConfig.boolProp_(props, 'ENFORCE_ACCESS_CONTROL', true);
        this.maxUrlLength = AppConfig.numProp_(props, 'MAX_URL_LENGTH', 2048, 128, 4096);
        this.randomAliasInitialLength = AppConfig.numProp_(props, 'RANDOM_ALIAS_INITIAL_LENGTH', 6, 3, 64);
        this.randomAliasMaxLength = AppConfig.numProp_(props, 'RANDOM_ALIAS_MAX_LENGTH', 12, 3, 64);
        this.randomAliasTryPerLength = AppConfig.numProp_(props, 'RANDOM_ALIAS_TRY_PER_LENGTH', 12, 1, 200);
        this.defaultDailyQuota = AppConfig.numProp_(props, 'DEFAULT_DAILY_QUOTA', 0, 0, 500000);
        this.capabilityTokenLength = AppConfig.numProp_(props, 'CAPABILITY_TOKEN_LENGTH', 64, 32, 256);
        this.publicSiteUrl = AppConfig.textProp_(props, 'PUBLIC_SITE_URL', 'https://t.purr.tw').replace(/\/$/, '');
        this.invitePagePath =
            AppConfig.textProp_(props, 'INVITE_PAGE_PATH', '/invite').replace(/\/$/, '') || '/invite';
        this.aliasPattern = /^[a-z0-9_-]{3,32}$/;
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
    inviteLink(capabilityToken) {
        return `${this.publicSiteUrl}${this.invitePagePath}#t=${encodeURIComponent(capabilityToken)}`;
    }
}
/** Small stateless helpers shared by multiple layers. */
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
    static status(value) {
        return InputNormalizer.text(value).toLowerCase();
    }
}
class DateUtil {
    static now() {
        return new Date();
    }
    static nowIso() {
        return DateUtil.now().toISOString();
    }
    static parseIso(value) {
        if (!value)
            return null;
        const date = new Date(value);
        if (Number.isNaN(date.getTime()))
            return null;
        return date;
    }
    static isExpired(iso, now) {
        const parsed = DateUtil.parseIso(iso);
        if (!parsed)
            return false;
        return parsed.getTime() <= now.getTime();
    }
    static nextUtcDayIso(now) {
        const next = new Date(now.getTime());
        next.setUTCHours(0, 0, 0, 0);
        next.setUTCDate(next.getUTCDate() + 1);
        return next.toISOString();
    }
}
class DigestUtil {
    static sha256Hex(value) {
        const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
        return bytes
            .map((byte) => {
            const normalized = byte < 0 ? byte + 256 : byte;
            const hex = normalized.toString(16);
            return hex.length === 1 ? `0${hex}` : hex;
        })
            .join('');
    }
    static timingSafeEqual(a, b) {
        if (a.length !== b.length)
            return false;
        let mismatch = 0;
        for (let i = 0; i < a.length; i += 1)
            mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
        return mismatch === 0;
    }
}
class RandomUtil {
    static randomString(length, charset) {
        let out = '';
        for (let i = 0; i < length; i += 1) {
            out += charset.charAt(Math.floor(Math.random() * charset.length));
        }
        return out;
    }
    static randomAlias(length) {
        return RandomUtil.randomString(length, RandomUtil.ALPHA_NUM);
    }
    static randomClientCode(length) {
        return `c_${RandomUtil.randomString(length, RandomUtil.LOWER_ALPHA_NUM)}`;
    }
    static randomToken(length) {
        let token = '';
        while (token.length < length) {
            token += Utilities.getUuid().replace(/-/g, '');
        }
        return token.slice(0, length);
    }
}
RandomUtil.ALPHA_NUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
RandomUtil.LOWER_ALPHA_NUM = 'abcdefghijklmnopqrstuvwxyz0123456789';
/**
 * Data Access Layer (DAL) for all spreadsheet operations.
 * Keep all sheet schema/columns/queries here to avoid leaking sheet details into services.
 */
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
    ensureSchema() {
        this.ensureShortSheet_();
        this.ensureClientsSheet_();
        this.ensureInvitesSheet_();
        this.ensureAuditSheet_();
    }
    getShortLink(alias) {
        const sheet = this.ensureShortSheet_();
        const row = this.findShortAliasRow_(sheet, alias);
        if (row === 0)
            return null;
        return {
            row,
            alias: InputNormalizer.alias(sheet.getRange(row, SheetRepository.SHORT_COL_ALIAS).getValue()),
            url: InputNormalizer.text(sheet.getRange(row, SheetRepository.SHORT_COL_URL).getValue()),
            status: InputNormalizer.status(sheet.getRange(row, SheetRepository.SHORT_COL_STATUS).getValue()) || 'active'
        };
    }
    incrementShortLinkClicks(row) {
        const sheet = this.ensureShortSheet_();
        const clickRange = sheet.getRange(row, SheetRepository.SHORT_COL_CLICKS);
        const current = Number(clickRange.getValue()) || 0;
        clickRange.setValue(current + 1);
        sheet.getRange(row, SheetRepository.SHORT_COL_LAST_ACCESS_AT).setValue(DateUtil.nowIso());
        sheet.getRange(row, SheetRepository.SHORT_COL_UPDATED_AT).setValue(DateUtil.nowIso());
    }
    aliasExists(alias) {
        const sheet = this.ensureShortSheet_();
        return this.findShortAliasRow_(sheet, alias) !== 0;
    }
    appendShortLink(alias, url, clientCode) {
        const sheet = this.ensureShortSheet_();
        const now = DateUtil.nowIso();
        sheet.appendRow([alias, url, 0, clientCode, 'active', now, now, '']);
    }
    createInvite(inviteCodeHash, maxUses, expiresAt, issuedBy, issuedToHint, note) {
        const sheet = this.ensureInvitesSheet_();
        const now = DateUtil.nowIso();
        sheet.appendRow([
            inviteCodeHash,
            'active',
            maxUses,
            0,
            expiresAt,
            issuedBy,
            issuedToHint,
            now,
            '',
            note
        ]);
    }
    disableInvite(inviteCodeHash) {
        const sheet = this.ensureInvitesSheet_();
        const row = this.findInviteRowByHash_(sheet, inviteCodeHash);
        if (row === 0)
            return { success: false, result: '', error: 'invite_not_found' };
        sheet.getRange(row, SheetRepository.INVITE_COL_STATUS).setValue('disabled');
        return { success: true, result: 'disabled' };
    }
    exchangeInvite(inviteCodeHash, ownerName) {
        const sheet = this.ensureInvitesSheet_();
        const row = this.findInviteRowByHash_(sheet, inviteCodeHash);
        if (row === 0)
            return { success: false, result: '', error: 'invalid_invite' };
        const invite = {
            row,
            status: InputNormalizer.status(sheet.getRange(row, SheetRepository.INVITE_COL_STATUS).getValue()) || 'active',
            maxUses: Number(sheet.getRange(row, SheetRepository.INVITE_COL_MAX_USES).getValue()) || 0,
            usedCount: Number(sheet.getRange(row, SheetRepository.INVITE_COL_USED_COUNT).getValue()) || 0,
            expiresAt: InputNormalizer.text(sheet.getRange(row, SheetRepository.INVITE_COL_EXPIRES_AT).getValue())
        };
        if (invite.status !== 'active')
            return { success: false, result: '', error: 'invite_disabled' };
        if (DateUtil.isExpired(invite.expiresAt, DateUtil.now())) {
            sheet.getRange(row, SheetRepository.INVITE_COL_STATUS).setValue('expired');
            return { success: false, result: '', error: 'invite_expired' };
        }
        if (invite.maxUses > 0 && invite.usedCount >= invite.maxUses) {
            return { success: false, result: '', error: 'invite_limit_reached' };
        }
        const capabilityToken = RandomUtil.randomToken(this.config.capabilityTokenLength);
        const capabilityTokenHash = DigestUtil.sha256Hex(capabilityToken);
        const clientCode = this.generateUniqueClientCode_();
        const now = DateUtil.now();
        const nowIso = now.toISOString();
        const resetIso = DateUtil.nextUtcDayIso(now);
        const displayOwner = InputNormalizer.text(ownerName) || clientCode;
        const clientsSheet = this.ensureClientsSheet_();
        clientsSheet.appendRow([
            clientCode,
            displayOwner,
            'active',
            capabilityTokenHash,
            `${capabilityToken.slice(0, 6)}...`,
            nowIso,
            '',
            this.config.defaultDailyQuota,
            0,
            resetIso,
            '',
            'issued_by_invite'
        ]);
        sheet.getRange(row, SheetRepository.INVITE_COL_USED_COUNT).setValue(invite.usedCount + 1);
        sheet.getRange(row, SheetRepository.INVITE_COL_LAST_USED_AT).setValue(nowIso);
        const link = this.config.inviteLink(capabilityToken);
        return {
            success: true,
            result: link,
            link,
            capabilityToken,
            clientCode
        };
    }
    authorizeClientByCapabilityToken(capabilityToken) {
        const tokenHash = DigestUtil.sha256Hex(capabilityToken);
        const clientsSheet = this.ensureClientsSheet_();
        const row = this.findClientRowByTokenHash_(clientsSheet, tokenHash);
        if (row === 0)
            return { success: false, result: '', error: 'unauthorized_client' };
        const now = DateUtil.now();
        const nowIso = now.toISOString();
        const record = {
            row,
            clientCode: InputNormalizer.text(clientsSheet.getRange(row, SheetRepository.CLIENT_COL_CODE).getValue()),
            ownerName: InputNormalizer.text(clientsSheet.getRange(row, SheetRepository.CLIENT_COL_OWNER).getValue()),
            status: InputNormalizer.status(clientsSheet.getRange(row, SheetRepository.CLIENT_COL_STATUS).getValue()) || 'active',
            capabilityTokenHash: InputNormalizer.text(clientsSheet.getRange(row, SheetRepository.CLIENT_COL_TOKEN_HASH).getValue()),
            expiresAt: InputNormalizer.text(clientsSheet.getRange(row, SheetRepository.CLIENT_COL_EXPIRES_AT).getValue()),
            dailyQuota: Number(clientsSheet.getRange(row, SheetRepository.CLIENT_COL_DAILY_QUOTA).getValue()) || 0,
            dailyUsed: Number(clientsSheet.getRange(row, SheetRepository.CLIENT_COL_DAILY_USED).getValue()) || 0,
            quotaResetAt: InputNormalizer.text(clientsSheet.getRange(row, SheetRepository.CLIENT_COL_QUOTA_RESET_AT).getValue())
        };
        if (!DigestUtil.timingSafeEqual(tokenHash, record.capabilityTokenHash)) {
            return { success: false, result: '', error: 'unauthorized_client' };
        }
        if (record.status !== 'active')
            return { success: false, result: '', error: 'client_disabled' };
        if (DateUtil.isExpired(record.expiresAt, now))
            return { success: false, result: '', error: 'token_expired' };
        let dailyUsed = record.dailyUsed;
        let quotaResetAt = record.quotaResetAt;
        if (!quotaResetAt || DateUtil.isExpired(quotaResetAt, now)) {
            dailyUsed = 0;
            quotaResetAt = DateUtil.nextUtcDayIso(now);
            clientsSheet.getRange(row, SheetRepository.CLIENT_COL_DAILY_USED).setValue(0);
            clientsSheet.getRange(row, SheetRepository.CLIENT_COL_QUOTA_RESET_AT).setValue(quotaResetAt);
        }
        if (record.dailyQuota > 0 && dailyUsed >= record.dailyQuota) {
            return { success: false, result: '', error: 'client_quota_exceeded' };
        }
        clientsSheet.getRange(row, SheetRepository.CLIENT_COL_DAILY_USED).setValue(dailyUsed + 1);
        clientsSheet.getRange(row, SheetRepository.CLIENT_COL_LAST_USED_AT).setValue(nowIso);
        return {
            success: true,
            result: record.clientCode,
            clientCode: record.clientCode,
            ownerName: record.ownerName
        };
    }
    disableClient(clientCode) {
        const clientsSheet = this.ensureClientsSheet_();
        const row = this.findClientRowByCode_(clientsSheet, clientCode);
        if (row === 0)
            return { success: false, result: '', error: 'client_not_found' };
        clientsSheet.getRange(row, SheetRepository.CLIENT_COL_STATUS).setValue('disabled');
        return { success: true, result: clientCode };
    }
    rotateClientToken(clientCode) {
        const clientsSheet = this.ensureClientsSheet_();
        const row = this.findClientRowByCode_(clientsSheet, clientCode);
        if (row === 0)
            return { success: false, result: '', error: 'client_not_found' };
        const capabilityToken = RandomUtil.randomToken(this.config.capabilityTokenLength);
        const capabilityTokenHash = DigestUtil.sha256Hex(capabilityToken);
        const nowIso = DateUtil.nowIso();
        clientsSheet.getRange(row, SheetRepository.CLIENT_COL_TOKEN_HASH).setValue(capabilityTokenHash);
        clientsSheet
            .getRange(row, SheetRepository.CLIENT_COL_TOKEN_HINT)
            .setValue(`${capabilityToken.slice(0, 6)}...`);
        clientsSheet.getRange(row, SheetRepository.CLIENT_COL_ISSUED_AT).setValue(nowIso);
        clientsSheet.getRange(row, SheetRepository.CLIENT_COL_STATUS).setValue('active');
        clientsSheet.getRange(row, SheetRepository.CLIENT_COL_DAILY_USED).setValue(0);
        clientsSheet
            .getRange(row, SheetRepository.CLIENT_COL_QUOTA_RESET_AT)
            .setValue(DateUtil.nextUtcDayIso(DateUtil.now()));
        return {
            success: true,
            result: this.config.inviteLink(capabilityToken),
            capabilityToken
        };
    }
    /**
     * Admin helper: create or update a client with an explicit capability token.
     * Token is never stored as plaintext; only hash + hint are persisted.
     */
    upsertClient(clientCodeInput, ownerNameInput, capabilityTokenInput, expiresAtIsoInput, dailyQuotaInput, noteInput) {
        const clientCode = InputNormalizer.text(clientCodeInput);
        if (!clientCode)
            return { success: false, result: '', error: 'missing_client_code' };
        const capabilityToken = InputNormalizer.text(capabilityTokenInput);
        if (!capabilityToken)
            return { success: false, result: '', error: 'missing_capability_token' };
        const ownerName = InputNormalizer.text(ownerNameInput) || clientCode;
        const expiresAtIso = InputNormalizer.text(expiresAtIsoInput);
        if (expiresAtIso && !DateUtil.parseIso(expiresAtIso)) {
            return { success: false, result: '', error: 'invalid_expires_at' };
        }
        const dailyQuotaValue = Number(dailyQuotaInput);
        const dailyQuota = Number.isFinite(dailyQuotaValue)
            ? Math.max(0, Math.floor(dailyQuotaValue))
            : this.config.defaultDailyQuota;
        const now = DateUtil.now();
        const nowIso = now.toISOString();
        const quotaResetAt = DateUtil.nextUtcDayIso(now);
        const capabilityTokenHash = DigestUtil.sha256Hex(capabilityToken);
        const tokenHint = `${capabilityToken.slice(0, 6)}...`;
        const note = InputNormalizer.text(noteInput);
        const clientsSheet = this.ensureClientsSheet_();
        const row = this.findClientRowByCode_(clientsSheet, clientCode);
        if (row === 0) {
            clientsSheet.appendRow([
                clientCode,
                ownerName,
                'active',
                capabilityTokenHash,
                tokenHint,
                nowIso,
                expiresAtIso,
                dailyQuota,
                0,
                quotaResetAt,
                '',
                note
            ]);
        }
        else {
            clientsSheet.getRange(row, SheetRepository.CLIENT_COL_OWNER).setValue(ownerName);
            clientsSheet.getRange(row, SheetRepository.CLIENT_COL_STATUS).setValue('active');
            clientsSheet.getRange(row, SheetRepository.CLIENT_COL_TOKEN_HASH).setValue(capabilityTokenHash);
            clientsSheet.getRange(row, SheetRepository.CLIENT_COL_TOKEN_HINT).setValue(tokenHint);
            clientsSheet.getRange(row, SheetRepository.CLIENT_COL_ISSUED_AT).setValue(nowIso);
            clientsSheet.getRange(row, SheetRepository.CLIENT_COL_EXPIRES_AT).setValue(expiresAtIso);
            clientsSheet.getRange(row, SheetRepository.CLIENT_COL_DAILY_QUOTA).setValue(dailyQuota);
            clientsSheet.getRange(row, SheetRepository.CLIENT_COL_DAILY_USED).setValue(0);
            clientsSheet.getRange(row, SheetRepository.CLIENT_COL_QUOTA_RESET_AT).setValue(quotaResetAt);
            clientsSheet.getRange(row, SheetRepository.CLIENT_COL_NOTE).setValue(note);
        }
        return { success: true, result: clientCode, clientCode };
    }
    appendAuditLog(event, clientCode, ip, result, reason) {
        const sheet = this.ensureAuditSheet_();
        sheet.appendRow([DateUtil.nowIso(), event, clientCode, ip, result, reason]);
    }
    ensureShortSheet_() {
        const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
        const existing = spreadsheet.getSheetByName(this.config.shortLinksSheetName);
        if (existing)
            return existing;
        const created = spreadsheet.insertSheet(this.config.shortLinksSheetName);
        created.appendRow([
            'alias',
            'url',
            'clicks',
            'created_by_client',
            'status',
            'created_at',
            'updated_at',
            'last_access_at'
        ]);
        return created;
    }
    ensureClientsSheet_() {
        const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
        const existing = spreadsheet.getSheetByName(this.config.clientsSheetName);
        if (existing)
            return existing;
        const created = spreadsheet.insertSheet(this.config.clientsSheetName);
        created.appendRow([
            'client_code',
            'owner_name',
            'status',
            'capability_token_hash',
            'token_hint',
            'issued_at',
            'expires_at',
            'daily_quota',
            'daily_used',
            'quota_reset_at',
            'last_used_at',
            'note'
        ]);
        return created;
    }
    ensureInvitesSheet_() {
        const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
        const existing = spreadsheet.getSheetByName(this.config.invitesSheetName);
        if (existing)
            return existing;
        const created = spreadsheet.insertSheet(this.config.invitesSheetName);
        created.appendRow([
            'invite_code_hash',
            'status',
            'max_uses',
            'used_count',
            'expires_at',
            'issued_by',
            'issued_to_hint',
            'created_at',
            'last_used_at',
            'note'
        ]);
        return created;
    }
    ensureAuditSheet_() {
        const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
        const existing = spreadsheet.getSheetByName(this.config.auditLogsSheetName);
        if (existing)
            return existing;
        const created = spreadsheet.insertSheet(this.config.auditLogsSheetName);
        created.appendRow(['time', 'event', 'client_code', 'ip', 'result', 'reason']);
        return created;
    }
    findShortAliasRow_(sheet, alias) {
        const lastRow = sheet.getLastRow();
        if (lastRow < 1)
            return 0;
        const hasHeader = InputNormalizer.alias(sheet.getRange(1, 1).getValue()) === 'alias';
        const startRow = hasHeader ? 2 : 1;
        const rowCount = lastRow - startRow + 1;
        if (rowCount <= 0)
            return 0;
        const values = sheet.getRange(startRow, SheetRepository.SHORT_COL_ALIAS, rowCount, 1).getValues();
        const normalized = InputNormalizer.alias(alias);
        for (let i = 0; i < values.length; i += 1) {
            if (InputNormalizer.alias(values[i][0]) === normalized)
                return startRow + i;
        }
        return 0;
    }
    findClientRowByTokenHash_(sheet, capabilityTokenHash) {
        const lastRow = sheet.getLastRow();
        if (lastRow < 2)
            return 0;
        const values = sheet
            .getRange(2, SheetRepository.CLIENT_COL_TOKEN_HASH, lastRow - 1, 1)
            .getValues();
        for (let i = 0; i < values.length; i += 1) {
            if (InputNormalizer.text(values[i][0]) === capabilityTokenHash)
                return i + 2;
        }
        return 0;
    }
    findClientRowByCode_(sheet, clientCode) {
        const lastRow = sheet.getLastRow();
        if (lastRow < 2)
            return 0;
        const values = sheet.getRange(2, SheetRepository.CLIENT_COL_CODE, lastRow - 1, 1).getValues();
        for (let i = 0; i < values.length; i += 1) {
            if (InputNormalizer.text(values[i][0]) === clientCode)
                return i + 2;
        }
        return 0;
    }
    findInviteRowByHash_(sheet, inviteCodeHash) {
        const lastRow = sheet.getLastRow();
        if (lastRow < 2)
            return 0;
        const values = sheet.getRange(2, SheetRepository.INVITE_COL_HASH, lastRow - 1, 1).getValues();
        for (let i = 0; i < values.length; i += 1) {
            if (InputNormalizer.text(values[i][0]) === inviteCodeHash)
                return i + 2;
        }
        return 0;
    }
    generateUniqueClientCode_() {
        const clientsSheet = this.ensureClientsSheet_();
        for (let i = 0; i < 30; i += 1) {
            const candidate = RandomUtil.randomClientCode(10);
            if (this.findClientRowByCode_(clientsSheet, candidate) === 0)
                return candidate;
        }
        throw new Error('client_code_generation_failed');
    }
}
SheetRepository.SHORT_COL_ALIAS = 1;
SheetRepository.SHORT_COL_URL = 2;
SheetRepository.SHORT_COL_CLICKS = 3;
SheetRepository.SHORT_COL_CREATED_BY = 4;
SheetRepository.SHORT_COL_STATUS = 5;
SheetRepository.SHORT_COL_CREATED_AT = 6;
SheetRepository.SHORT_COL_UPDATED_AT = 7;
SheetRepository.SHORT_COL_LAST_ACCESS_AT = 8;
SheetRepository.CLIENT_COL_CODE = 1;
SheetRepository.CLIENT_COL_OWNER = 2;
SheetRepository.CLIENT_COL_STATUS = 3;
SheetRepository.CLIENT_COL_TOKEN_HASH = 4;
SheetRepository.CLIENT_COL_TOKEN_HINT = 5;
SheetRepository.CLIENT_COL_ISSUED_AT = 6;
SheetRepository.CLIENT_COL_EXPIRES_AT = 7;
SheetRepository.CLIENT_COL_DAILY_QUOTA = 8;
SheetRepository.CLIENT_COL_DAILY_USED = 9;
SheetRepository.CLIENT_COL_QUOTA_RESET_AT = 10;
SheetRepository.CLIENT_COL_LAST_USED_AT = 11;
SheetRepository.CLIENT_COL_NOTE = 12;
SheetRepository.INVITE_COL_HASH = 1;
SheetRepository.INVITE_COL_STATUS = 2;
SheetRepository.INVITE_COL_MAX_USES = 3;
SheetRepository.INVITE_COL_USED_COUNT = 4;
SheetRepository.INVITE_COL_EXPIRES_AT = 5;
SheetRepository.INVITE_COL_ISSUED_BY = 6;
SheetRepository.INVITE_COL_ISSUED_TO_HINT = 7;
SheetRepository.INVITE_COL_CREATED_AT = 8;
SheetRepository.INVITE_COL_LAST_USED_AT = 9;
SheetRepository.INVITE_COL_NOTE = 10;
/**
 * Application/domain services layer.
 * Handles business rules while repository stays focused on Sheets IO details.
 */
class CaptchaService {
    constructor(config) {
        this.config = config;
    }
    verify(token, ip) {
        if (!this.config.recaptchaSecret)
            return { success: true, result: '', skipped: true };
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
/** Authorization service for create API capability-token checks. */
class AccessControlService {
    constructor(repository, config) {
        this.repository = repository;
        this.config = config;
    }
    authorizeCreate(capabilityToken) {
        if (!this.config.enforceAccessControl)
            return { success: true, result: 'anonymous', skipped: true };
        if (!capabilityToken)
            return { success: false, result: '', error: 'capability_token_required' };
        return this.repository.withScriptLock(() => this.repository.authorizeClientByCapabilityToken(capabilityToken));
    }
}
/** Invite exchange flow service (invite code -> capability token link). */
class InviteService {
    constructor(repository) {
        this.repository = repository;
    }
    exchange(inviteCode, ownerName) {
        const normalized = InputNormalizer.text(inviteCode);
        if (!normalized)
            return { success: false, result: '', error: 'missing_invite_code' };
        const hash = DigestUtil.sha256Hex(normalized);
        return this.repository.withScriptLock(() => this.repository.exchangeInvite(hash, ownerName));
    }
}
/** Core short-url domain service (resolve/create/custom alias/random alias). */
class ShortUrlService {
    constructor(repository, config) {
        this.repository = repository;
        this.config = config;
    }
    resolve(aliasInput) {
        const alias = InputNormalizer.alias(aliasInput);
        if (!alias)
            return { success: false, result: '', error: 'missing_query' };
        const record = this.repository.getShortLink(alias);
        if (!record || !record.url)
            return { success: false, result: '', error: 'not_found' };
        if (record.status !== 'active')
            return { success: false, result: '', error: 'not_found' };
        this.repository.withScriptLock(() => {
            this.repository.incrementShortLinkClicks(record.row);
        });
        return { success: true, result: record.url };
    }
    create(urlInput, customAliasInput, clientCode) {
        const url = InputNormalizer.text(urlInput);
        if (!url)
            return { success: false, result: '', error: 'missing_url' };
        if (!this.isValidUrl_(url))
            return { success: false, result: '', error: 'invalid_url' };
        const rawAlias = InputNormalizer.text(customAliasInput);
        if (rawAlias)
            return this.createCustomAlias_(url, rawAlias, clientCode);
        return this.createRandomAlias_(url, clientCode);
    }
    createCustomAlias_(url, rawAlias, clientCode) {
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
    createRandomAlias_(url, clientCode) {
        return this.repository.withScriptLock(() => {
            for (let length = this.config.randomAliasInitialLength; length <= this.config.randomAliasMaxLength; length += 1) {
                for (let i = 0; i < this.config.randomAliasTryPerLength; i += 1) {
                    const candidate = RandomUtil.randomAlias(length);
                    if (this.repository.aliasExists(candidate))
                        continue;
                    this.repository.appendShortLink(candidate, url, clientCode);
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
            return false;
        try {
            const parsed = new URL(url);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        }
        catch (_err) {
            return false;
        }
    }
}
/**
 * HTTP transport/controller layer.
 * Maps request payload/actions to domain services and normalizes API output.
 */
class ApiController {
    constructor(config, repository, shortUrlService, captchaService, accessControlService, inviteService) {
        this.config = config;
        this.repository = repository;
        this.shortUrlService = shortUrlService;
        this.captchaService = captchaService;
        this.accessControlService = accessControlService;
        this.inviteService = inviteService;
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
            if (err instanceof InvalidJsonError)
                return json_({ success: false, result: '', error: 'invalid_json' });
            throw err;
        }
        const action = InputNormalizer.text(payload.action).toLowerCase();
        if (action === 'exchange_invite')
            return this.handleExchangeInvite_(payload);
        if (action === 'verify_captcha')
            return this.handleVerifyCaptcha_(payload);
        return this.handleCreate_(payload);
    }
    handleVerifyCaptcha_(payload) {
        const token = InputNormalizer.text(payload.token);
        const ip = InputNormalizer.text(payload.ip);
        if (!token)
            return json_({ success: false, result: '', error: 'missing_token' });
        return json_(this.captchaService.verify(token, ip));
    }
    handleExchangeInvite_(payload) {
        const inviteCode = InputNormalizer.text(payload.inviteCode);
        const ownerName = InputNormalizer.text(payload.ownerName);
        const ip = InputNormalizer.text(payload.ip);
        const result = this.inviteService.exchange(inviteCode, ownerName);
        this.repository.appendAuditLog('exchange_invite', InputNormalizer.text(result.clientCode), ip, result.success ? 'success' : 'fail', result.success ? 'ok' : InputNormalizer.text(result.error));
        return json_(result);
    }
    handleCreate_(payload) {
        const url = InputNormalizer.text(payload.url);
        const alias = InputNormalizer.text(payload.alias);
        const token = InputNormalizer.text(payload.token);
        const ip = InputNormalizer.text(payload.ip);
        const capabilityToken = InputNormalizer.text(payload.capabilityToken || payload.id);
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
        const accessResult = this.accessControlService.authorizeCreate(capabilityToken);
        if (!accessResult.success) {
            this.repository.appendAuditLog('create', InputNormalizer.text(accessResult.clientCode), ip, 'fail', InputNormalizer.text(accessResult.error));
            return json_(accessResult);
        }
        const createResult = this.shortUrlService.create(url, alias, InputNormalizer.text(accessResult.clientCode));
        this.repository.appendAuditLog('create', InputNormalizer.text(accessResult.clientCode), ip, createResult.success ? 'success' : 'fail', createResult.success ? 'ok' : InputNormalizer.text(createResult.error));
        return json_(createResult);
    }
    parsePayload_(e) {
        const merged = {};
        const params = (e && e.parameter) || {};
        for (const key of Object.keys(params))
            merged[key] = params[key];
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
        for (const key of Object.keys(parsedObj))
            merged[key] = parsedObj[key];
        return merged;
    }
}
/**
 * GAS backend entrypoint composition.
 *
 * Source layout (SOLID/DRY split):
 * - 00-types.ts: shared types/errors
 * - 10-config.ts: AppConfig
 * - 20-utils.ts: normalizer/date/hash/random helpers
 * - 30-repository.ts: Sheets DAL
 * - 40-services.ts: domain/application services
 * - 50-controller.ts: HTTP controller
 * - Code.ts: bootstrap + GAS global entrypoints + admin wrappers
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
const apiController = new ApiController(appConfig, sheetRepository, shortUrlService, captchaService, accessControlService, inviteService);
function doGet(e) {
    return apiController.handleGet(e);
}
function doPost(e) {
    return apiController.handlePost(e);
}
function createInvite(inviteCode, maxUses, expiresAtIso, issuedBy, issuedToHint, note) {
    const normalizedInvite = InputNormalizer.text(inviteCode);
    if (!normalizedInvite)
        return { success: false, result: '', error: 'missing_invite_code' };
    const hash = DigestUtil.sha256Hex(normalizedInvite);
    return sheetRepository.withScriptLock(() => {
        sheetRepository.createInvite(hash, maxUses || 1, InputNormalizer.text(expiresAtIso), InputNormalizer.text(issuedBy), InputNormalizer.text(issuedToHint), InputNormalizer.text(note));
        return { success: true, result: hash };
    });
}
function disableInvite(inviteCode) {
    const normalizedInvite = InputNormalizer.text(inviteCode);
    if (!normalizedInvite)
        return { success: false, result: '', error: 'missing_invite_code' };
    const hash = DigestUtil.sha256Hex(normalizedInvite);
    return sheetRepository.withScriptLock(() => sheetRepository.disableInvite(hash));
}
function disableClient(clientCode) {
    const normalizedCode = InputNormalizer.text(clientCode);
    if (!normalizedCode)
        return { success: false, result: '', error: 'missing_client_code' };
    return sheetRepository.withScriptLock(() => sheetRepository.disableClient(normalizedCode));
}
function rotateClientToken(clientCode) {
    const normalizedCode = InputNormalizer.text(clientCode);
    if (!normalizedCode)
        return { success: false, result: '', error: 'missing_client_code' };
    return sheetRepository.withScriptLock(() => sheetRepository.rotateClientToken(normalizedCode));
}
/**
 * Legacy wrappers for old scripts/macros.
 * Keep names stable so existing manual ops still work after refactor.
 */
function create(inviteCode) {
    const result = createInvite(inviteCode, 1, '', 'legacy_create', '', 'created by legacy create() wrapper');
    return json_(result);
}
function query(alias) {
    return json_(shortUrlService.resolve(alias));
}
function add(url, id, alias, token, ip) {
    const payload = {
        url,
        alias,
        token,
        ip,
        capabilityToken: id
    };
    return apiController.handlePost({
        parameter: payload,
        postData: {
            contents: '',
            length: 0,
            name: '',
            type: ''
        }
    });
}
function asJSON(text) {
    return json_({ result: text });
}
function upsertClient(clientCode, ownerName, capabilityToken, expiresAtIso, dailyQuota, note) {
    return sheetRepository.withScriptLock(() => sheetRepository.upsertClient(clientCode, ownerName, capabilityToken, expiresAtIso, dailyQuota, note));
}
function json_(obj) {
    return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
