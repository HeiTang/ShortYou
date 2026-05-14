/**
 * Data Access Layer (DAL) for all spreadsheet operations.
 * 所有欄位定義、查詢與寫入都集中於此，避免服務層直接耦合 Sheet 細節。
 */
class SheetRepository {
  private static readonly SHORT_COL_ALIAS = 1;
  private static readonly SHORT_COL_URL = 2;
  private static readonly SHORT_COL_CLICKS = 3;
  private static readonly SHORT_COL_CREATED_BY = 4;
  private static readonly SHORT_COL_STATUS = 5;
  private static readonly SHORT_COL_CREATED_AT = 6;
  private static readonly SHORT_COL_UPDATED_AT = 7;
  private static readonly SHORT_COL_LAST_ACCESS_AT = 8;

  private static readonly CLIENT_COL_CODE = 1;
  private static readonly CLIENT_COL_OWNER = 2;
  private static readonly CLIENT_COL_STATUS = 3;
  private static readonly CLIENT_COL_TOKEN_HASH = 4;
  private static readonly CLIENT_COL_TOKEN_HINT = 5;
  private static readonly CLIENT_COL_ISSUED_AT = 6;
  private static readonly CLIENT_COL_EXPIRES_AT = 7;
  private static readonly CLIENT_COL_DAILY_QUOTA = 8;
  private static readonly CLIENT_COL_DAILY_USED = 9;
  private static readonly CLIENT_COL_QUOTA_RESET_AT = 10;
  private static readonly CLIENT_COL_LAST_USED_AT = 11;
  private static readonly CLIENT_COL_NOTE = 12;

  private static readonly INVITE_COL_HASH = 1;
  private static readonly INVITE_COL_STATUS = 2;
  private static readonly INVITE_COL_MAX_USES = 3;
  private static readonly INVITE_COL_USED_COUNT = 4;
  private static readonly INVITE_COL_EXPIRES_AT = 5;
  private static readonly INVITE_COL_ISSUED_BY = 6;
  private static readonly INVITE_COL_ISSUED_TO_HINT = 7;
  private static readonly INVITE_COL_CREATED_AT = 8;
  private static readonly INVITE_COL_LAST_USED_AT = 9;
  private static readonly INVITE_COL_NOTE = 10;

  constructor(private readonly config: AppConfig) {}

  withScriptLock<T>(callback: () => T): T {
    // 寫入關鍵流程加鎖，避免併發造成 alias 或配額競態。
    const lock = LockService.getScriptLock();
    lock.waitLock(5000);
    try {
      return callback();
    } finally {
      lock.releaseLock();
    }
  }

  ensureSchema(): void {
    // 啟動時確保四張核心資料表存在，若不存在則自動建立。
    this.ensureShortSheet_();
    this.ensureClientsSheet_();
    this.ensureInvitesSheet_();
    this.ensureAuditSheet_();
  }

  getShortLink(alias: string): ShortLinkRecord | null {
    const sheet = this.ensureShortSheet_();
    const row = this.findShortAliasRow_(sheet, alias);
    if (row === 0) return null;

    return {
      row,
      alias: InputNormalizer.alias(sheet.getRange(row, SheetRepository.SHORT_COL_ALIAS).getValue()),
      url: InputNormalizer.text(sheet.getRange(row, SheetRepository.SHORT_COL_URL).getValue()),
      status: InputNormalizer.status(sheet.getRange(row, SheetRepository.SHORT_COL_STATUS).getValue()) || 'active'
    };
  }

  incrementShortLinkClicks(row: number): void {
    const sheet = this.ensureShortSheet_();
    const clickRange = sheet.getRange(row, SheetRepository.SHORT_COL_CLICKS);
    const current = Number(clickRange.getValue()) || 0;
    clickRange.setValue(current + 1);
    sheet.getRange(row, SheetRepository.SHORT_COL_LAST_ACCESS_AT).setValue(DateUtil.nowIso());
    sheet.getRange(row, SheetRepository.SHORT_COL_UPDATED_AT).setValue(DateUtil.nowIso());
  }

  aliasExists(alias: string): boolean {
    const sheet = this.ensureShortSheet_();
    return this.findShortAliasRow_(sheet, alias) !== 0;
  }

  appendShortLink(alias: string, url: string, clientCode: string): void {
    const sheet = this.ensureShortSheet_();
    const now = DateUtil.nowIso();
    sheet.appendRow([alias, url, 0, clientCode, 'active', now, now, '']);
  }

  createInvite(
    inviteCodeHash: string,
    maxUses: number,
    expiresAt: string,
    issuedBy: string,
    issuedToHint: string,
    note: string
  ): void {
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

  disableInvite(inviteCodeHash: string): ApiResult {
    const sheet = this.ensureInvitesSheet_();
    const row = this.findInviteRowByHash_(sheet, inviteCodeHash);
    if (row === 0) return { success: false, result: '', error: 'invite_not_found' };
    sheet.getRange(row, SheetRepository.INVITE_COL_STATUS).setValue('disabled');
    return { success: true, result: 'disabled' };
  }

  exchangeInvite(inviteCodeHash: string, ownerName: string): ApiResult {
    const sheet = this.ensureInvitesSheet_();
    const row = this.findInviteRowByHash_(sheet, inviteCodeHash);
    if (row === 0) return { success: false, result: '', error: 'invalid_invite' };

    const invite: InviteRecord = {
      row,
      status: InputNormalizer.status(sheet.getRange(row, SheetRepository.INVITE_COL_STATUS).getValue()) || 'active',
      maxUses: Number(sheet.getRange(row, SheetRepository.INVITE_COL_MAX_USES).getValue()) || 0,
      usedCount: Number(sheet.getRange(row, SheetRepository.INVITE_COL_USED_COUNT).getValue()) || 0,
      expiresAt: InputNormalizer.text(
        sheet.getRange(row, SheetRepository.INVITE_COL_EXPIRES_AT).getValue()
      )
    };

    if (invite.status !== 'active') return { success: false, result: '', error: 'invite_disabled' };
    if (DateUtil.isExpired(invite.expiresAt, DateUtil.now())) {
      // 到期時同步回寫狀態，避免下一次仍被視為可用。
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
    // 兌換成功後建立 client，僅儲存 capability token hash。
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

  authorizeClientByCapabilityToken(capabilityToken: string): ApiResult {
    const tokenHash = DigestUtil.sha256Hex(capabilityToken);
    const clientsSheet = this.ensureClientsSheet_();
    const row = this.findClientRowByTokenHash_(clientsSheet, tokenHash);
    if (row === 0) return { success: false, result: '', error: 'unauthorized_client' };

    const now = DateUtil.now();
    const nowIso = now.toISOString();
    const record: ClientRecord = {
      row,
      clientCode: InputNormalizer.text(clientsSheet.getRange(row, SheetRepository.CLIENT_COL_CODE).getValue()),
      ownerName: InputNormalizer.text(clientsSheet.getRange(row, SheetRepository.CLIENT_COL_OWNER).getValue()),
      status: InputNormalizer.status(
        clientsSheet.getRange(row, SheetRepository.CLIENT_COL_STATUS).getValue()
      ) || 'active',
      capabilityTokenHash: InputNormalizer.text(
        clientsSheet.getRange(row, SheetRepository.CLIENT_COL_TOKEN_HASH).getValue()
      ),
      expiresAt: InputNormalizer.text(clientsSheet.getRange(row, SheetRepository.CLIENT_COL_EXPIRES_AT).getValue()),
      dailyQuota: Number(clientsSheet.getRange(row, SheetRepository.CLIENT_COL_DAILY_QUOTA).getValue()) || 0,
      dailyUsed: Number(clientsSheet.getRange(row, SheetRepository.CLIENT_COL_DAILY_USED).getValue()) || 0,
      quotaResetAt: InputNormalizer.text(
        clientsSheet.getRange(row, SheetRepository.CLIENT_COL_QUOTA_RESET_AT).getValue()
      )
    };

    if (!DigestUtil.timingSafeEqual(tokenHash, record.capabilityTokenHash)) {
      return { success: false, result: '', error: 'unauthorized_client' };
    }
    if (record.status !== 'active') return { success: false, result: '', error: 'client_disabled' };
    if (DateUtil.isExpired(record.expiresAt, now)) return { success: false, result: '', error: 'token_expired' };

    let dailyUsed = record.dailyUsed;
    let quotaResetAt = record.quotaResetAt;
    if (!quotaResetAt || DateUtil.isExpired(quotaResetAt, now)) {
      // 到達重置時間即歸零，並設定下一個 UTC 重置時間。
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

  disableClient(clientCode: string): ApiResult {
    const clientsSheet = this.ensureClientsSheet_();
    const row = this.findClientRowByCode_(clientsSheet, clientCode);
    if (row === 0) return { success: false, result: '', error: 'client_not_found' };
    clientsSheet.getRange(row, SheetRepository.CLIENT_COL_STATUS).setValue('disabled');
    return { success: true, result: clientCode };
  }

  rotateClientToken(clientCode: string): ApiResult {
    const clientsSheet = this.ensureClientsSheet_();
    const row = this.findClientRowByCode_(clientsSheet, clientCode);
    if (row === 0) return { success: false, result: '', error: 'client_not_found' };

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
   * 管理端工具：以指定 capability token 建立或更新 client。
   * token 不會以明文儲存，只落地 hash 與提示片段。
   */
  upsertClient(
    clientCodeInput: string,
    ownerNameInput: string,
    capabilityTokenInput: string,
    expiresAtIsoInput: string,
    dailyQuotaInput: number,
    noteInput: string
  ): ApiResult {
    const clientCode = InputNormalizer.text(clientCodeInput);
    if (!clientCode) return { success: false, result: '', error: 'missing_client_code' };

    const capabilityToken = InputNormalizer.text(capabilityTokenInput);
    if (!capabilityToken) return { success: false, result: '', error: 'missing_capability_token' };

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
    } else {
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

  appendAuditLog(
    event: string,
    clientCode: string,
    ip: string,
    result: 'success' | 'fail',
    reason: string
  ): void {
    // 稽核日誌使用 append-only，降低追查問題時資料被覆寫的風險。
    const sheet = this.ensureAuditSheet_();
    sheet.appendRow([DateUtil.nowIso(), event, clientCode, ip, result, reason]);
  }

  private ensureShortSheet_(): GoogleAppsScript.Spreadsheet.Sheet {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const existing = spreadsheet.getSheetByName(this.config.shortLinksSheetName);
    if (existing) return existing;

    const created = spreadsheet.insertSheet(this.config.shortLinksSheetName);
    // Header 名稱即為資料契約，變更前需同步更新 repository 欄位常數。
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

  private ensureClientsSheet_(): GoogleAppsScript.Spreadsheet.Sheet {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const existing = spreadsheet.getSheetByName(this.config.clientsSheetName);
    if (existing) return existing;

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

  private ensureInvitesSheet_(): GoogleAppsScript.Spreadsheet.Sheet {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const existing = spreadsheet.getSheetByName(this.config.invitesSheetName);
    if (existing) return existing;

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

  private ensureAuditSheet_(): GoogleAppsScript.Spreadsheet.Sheet {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const existing = spreadsheet.getSheetByName(this.config.auditLogsSheetName);
    if (existing) return existing;

    const created = spreadsheet.insertSheet(this.config.auditLogsSheetName);
    created.appendRow(['time', 'event', 'client_code', 'ip', 'result', 'reason']);
    return created;
  }

  private findShortAliasRow_(sheet: GoogleAppsScript.Spreadsheet.Sheet, alias: string): number {
    const lastRow = sheet.getLastRow();
    if (lastRow < 1) return 0;
    // 允許無 header 舊資料表，保持向後相容。
    const hasHeader = InputNormalizer.alias(sheet.getRange(1, 1).getValue()) === 'alias';
    const startRow = hasHeader ? 2 : 1;
    const rowCount = lastRow - startRow + 1;
    if (rowCount <= 0) return 0;

    const values = sheet.getRange(startRow, SheetRepository.SHORT_COL_ALIAS, rowCount, 1).getValues();
    const normalized = InputNormalizer.alias(alias);
    for (let i = 0; i < values.length; i += 1) {
      if (InputNormalizer.alias(values[i][0]) === normalized) return startRow + i;
    }
    return 0;
  }

  private findClientRowByTokenHash_(
    sheet: GoogleAppsScript.Spreadsheet.Sheet,
    capabilityTokenHash: string
  ): number {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return 0;
    const values = sheet
      .getRange(2, SheetRepository.CLIENT_COL_TOKEN_HASH, lastRow - 1, 1)
      .getValues();
    for (let i = 0; i < values.length; i += 1) {
      if (InputNormalizer.text(values[i][0]) === capabilityTokenHash) return i + 2;
    }
    return 0;
  }

  private findClientRowByCode_(sheet: GoogleAppsScript.Spreadsheet.Sheet, clientCode: string): number {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return 0;
    const values = sheet.getRange(2, SheetRepository.CLIENT_COL_CODE, lastRow - 1, 1).getValues();
    for (let i = 0; i < values.length; i += 1) {
      if (InputNormalizer.text(values[i][0]) === clientCode) return i + 2;
    }
    return 0;
  }

  private findInviteRowByHash_(sheet: GoogleAppsScript.Spreadsheet.Sheet, inviteCodeHash: string): number {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return 0;
    const values = sheet.getRange(2, SheetRepository.INVITE_COL_HASH, lastRow - 1, 1).getValues();
    for (let i = 0; i < values.length; i += 1) {
      if (InputNormalizer.text(values[i][0]) === inviteCodeHash) return i + 2;
    }
    return 0;
  }

  private generateUniqueClientCode_(): string {
    const clientsSheet = this.ensureClientsSheet_();
    for (let i = 0; i < 30; i += 1) {
      const candidate = RandomUtil.randomClientCode(10);
      if (this.findClientRowByCode_(clientsSheet, candidate) === 0) return candidate;
    }
    // 連續嘗試失敗代表碰撞率異常，交由上層記錄與告警。
    throw new Error('client_code_generation_failed');
  }
}
