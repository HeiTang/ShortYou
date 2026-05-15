export type FrontendConfig = {
  api: string;
  turnstileSiteKey: string;
};

const requireEnvText = (name: string, value: string | undefined): string => {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`Missing required frontend env: ${name}`);
  }
  return trimmed;
};

export function getFrontendConfig(): FrontendConfig {
  // 統一管理前端設定，避免在多個頁面重複硬編碼。
  return {
    api: requireEnvText('PUBLIC_API_URL', import.meta.env.PUBLIC_API_URL),
    turnstileSiteKey: requireEnvText(
      'PUBLIC_TURNSTILE_SITE_KEY',
      import.meta.env.PUBLIC_TURNSTILE_SITE_KEY
    )
  };
}
