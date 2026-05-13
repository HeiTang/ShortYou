const ERROR_TEXT: Record<string, string> = {
  invite_exchange_failed: 'Invite Code 兌換失敗，請確認後再試。',
  invalid_invite_code: 'Invite Code 無效。',
  invite_code_not_found: 'Invite Code 不存在。',
  invite_code_expired: 'Invite Code 已過期。',
  invite_code_used: 'Invite Code 已使用。',
  capability_token_required: '缺少授權資訊，請重新開啟邀請連結。',
  create_failed: '建立短網址失敗，請稍後再試。',
  alias_exists: '自訂短網址已被使用，請換一個。',
  invalid_url: 'URL 格式不正確，請以 http/https 開頭。',
  quota_exceeded: '今日配額已達上限，請稍後再試。',
  captcha_failed: 'reCAPTCHA 驗證失敗，請再試一次。',
  'timeout-or-duplicate': 'reCAPTCHA 已逾時，請重新驗證。',
  'invalid-input-response': 'reCAPTCHA 驗證無效，請重新驗證。',
  'invalid-input-secret': 'reCAPTCHA 設定錯誤，請通知管理者。'
};

export function humanizeInviteError(
  errorCode: string | undefined,
  fallback = '操作失敗，請稍後再試。'
): string {
  // 錯誤碼轉為可讀中文文案，避免在多處重複維護對應表。
  if (!errorCode) return fallback;
  return ERROR_TEXT[errorCode] || fallback;
}
