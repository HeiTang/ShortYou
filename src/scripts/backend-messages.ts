const ERROR_TEXT: Record<string, string> = {
  capability_token_required: '缺少授權資訊，請重新開啟建立連結。',
  unauthorized_client: '授權資訊無效，請重新取得建立連結。',
  client_disabled: '此建立權限已停用，請聯絡管理者。',
  token_expired: '此建立連結已過期，請重新申請。',
  client_quota_exceeded: '今日建立配額已用盡，請稍後再試。',
  create_failed: '建立短網址失敗，請稍後再試。',
  alias_exists: '自訂短網址已被使用，請換一個。',
  invalid_alias: '自訂短網址格式不正確，請只使用英文小寫、數字、底線或連字號。',
  reserved_alias: '此自訂短網址為保留字，請換一個。',
  invalid_url: 'URL 格式不正確，請以 http/https 開頭。',
  captcha_required: '請先完成 reCAPTCHA 驗證。',
  captcha_failed: 'reCAPTCHA 驗證失敗，請再試一次。',
  'timeout-or-duplicate': 'reCAPTCHA 已逾時，請重新驗證。',
  'invalid-input-response': 'reCAPTCHA 驗證無效，請重新驗證。',
  'invalid-input-secret': 'reCAPTCHA 設定錯誤，請通知管理者。'
};

export function humanizeBackendError(
  errorCode: string | undefined,
  fallback = '操作失敗，請稍後再試。'
): string {
  // 將後端錯誤碼轉成前端可直接顯示的繁中訊息。
  if (!errorCode) return fallback;
  return ERROR_TEXT[errorCode] || fallback;
}
