export type FrontendConfig = {
  api: string;
  recaptchaSiteKey: string;
};

const API_ENDPOINT_BASE64 =
  'aHR0cHM6Ly9zY3JpcHQuZ29vZ2xlLmNvbS9tYWNyb3Mvcy9BS2Z5Y2J6X2JXbW1LWWJmb0xjTmEzeWttUG9weUc5dmFEWTZkMWRtc2R4WHY3U0VRVF9vTFhETlEwZE5xb2NlQlVvbGpvNUkvZXhlYw==';
const RECAPTCHA_SITE_KEY = '6Lfj9-UbAAAAAJwP01RGsOE8h1R91m4yh5AqdU6e';

export function getFrontendConfig(): FrontendConfig {
  // 統一管理前端設定，避免在多個頁面重複硬編碼。
  return {
    api: atob(API_ENDPOINT_BASE64),
    recaptchaSiteKey: RECAPTCHA_SITE_KEY
  };
}
