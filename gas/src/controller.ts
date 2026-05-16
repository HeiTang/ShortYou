/**
 * HTTP transport/controller layer.
 * 負責解析請求、分派 action、呼叫服務層並統一輸出 JSON。
 */
class ApiController {
  constructor(
    private readonly config: AppConfig,
    private readonly repository: SheetRepository,
    private readonly shortUrlService: ShortUrlService,
    private readonly captchaService: CaptchaService,
    private readonly accessControlService: AccessControlService
  ) {}

  handleGet(e: GoogleAppsScript.Events.DoGet): GoogleAppsScript.Content.TextOutput {
    const action = InputNormalizer.text(e && e.parameter && e.parameter.action).toLowerCase();
    if (action === 'runtime_config_status') {
      return json_(getRuntimeConfigStatus());
    }

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
    // 預設行為為 create，與舊版前端呼叫方式相容。
    return this.handleCreate_(payload);
  }

  private handleCreate_(payload: Record<string, unknown>): GoogleAppsScript.Content.TextOutput {
    const url = InputNormalizer.text(payload.url);
    const alias = InputNormalizer.text(payload.alias);
    const token = InputNormalizer.text(payload.token);
    const ip = InputNormalizer.text(payload.ip);
    const capabilityToken = InputNormalizer.text(payload.capabilityToken || payload.id);

    if (!url) return json_({ success: false, result: '', error: 'missing_url' });

    if (this.config.turnstileSecret) {
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
    // 非 JSON 內容直接使用 form/query 參數，保持簡單請求相容。
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

    // JSON body 欄位會覆蓋同名參數，提供更明確的 payload 優先權。
    const parsedObj = parsed as Record<string, unknown>;
    for (const key of Object.keys(parsedObj)) merged[key] = parsedObj[key];
    return merged;
  }
}
