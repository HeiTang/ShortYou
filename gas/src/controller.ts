/**
 * HTTP transport/controller layer.
 * Maps request payload/actions to domain services and normalizes API output.
 */
class ApiController {
  constructor(
    private readonly config: AppConfig,
    private readonly repository: SheetRepository,
    private readonly shortUrlService: ShortUrlService,
    private readonly captchaService: CaptchaService,
    private readonly accessControlService: AccessControlService,
    private readonly inviteService: InviteService
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
      if (err instanceof InvalidJsonError) return json_({ success: false, result: '', error: 'invalid_json' });
      throw err;
    }

    const action = InputNormalizer.text(payload.action).toLowerCase();
    if (action === 'exchange_invite') return this.handleExchangeInvite_(payload);
    if (action === 'verify_captcha') return this.handleVerifyCaptcha_(payload);
    return this.handleCreate_(payload);
  }

  private handleVerifyCaptcha_(payload: Record<string, unknown>): GoogleAppsScript.Content.TextOutput {
    const token = InputNormalizer.text(payload.token);
    const ip = InputNormalizer.text(payload.ip);
    if (!token) return json_({ success: false, result: '', error: 'missing_token' });
    return json_(this.captchaService.verify(token, ip));
  }

  private handleExchangeInvite_(payload: Record<string, unknown>): GoogleAppsScript.Content.TextOutput {
    const inviteCode = InputNormalizer.text(payload.inviteCode);
    const ownerName = InputNormalizer.text(payload.ownerName);
    const ip = InputNormalizer.text(payload.ip);

    const result = this.inviteService.exchange(inviteCode, ownerName);
    this.repository.appendAuditLog(
      'exchange_invite',
      InputNormalizer.text(result.clientCode),
      ip,
      result.success ? 'success' : 'fail',
      result.success ? 'ok' : InputNormalizer.text(result.error)
    );
    return json_(result);
  }

  private handleCreate_(payload: Record<string, unknown>): GoogleAppsScript.Content.TextOutput {
    const url = InputNormalizer.text(payload.url);
    const alias = InputNormalizer.text(payload.alias);
    const token = InputNormalizer.text(payload.token);
    const ip = InputNormalizer.text(payload.ip);
    const capabilityToken = InputNormalizer.text(payload.capabilityToken || payload.id);

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

    const accessResult = this.accessControlService.authorizeCreate(capabilityToken);
    if (!accessResult.success) {
      this.repository.appendAuditLog(
        'create',
        InputNormalizer.text(accessResult.clientCode),
        ip,
        'fail',
        InputNormalizer.text(accessResult.error)
      );
      return json_(accessResult);
    }

    const createResult = this.shortUrlService.create(url, alias, InputNormalizer.text(accessResult.clientCode));
    this.repository.appendAuditLog(
      'create',
      InputNormalizer.text(accessResult.clientCode),
      ip,
      createResult.success ? 'success' : 'fail',
      createResult.success ? 'ok' : InputNormalizer.text(createResult.error)
    );
    return json_(createResult);
  }

  private parsePayload_(e: GoogleAppsScript.Events.DoPost): Record<string, unknown> {
    const merged: Record<string, unknown> = {};
    const params = (e && e.parameter) || {};
    for (const key of Object.keys(params)) merged[key] = params[key];

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
    for (const key of Object.keys(parsedObj)) merged[key] = parsedObj[key];
    return merged;
  }
}
