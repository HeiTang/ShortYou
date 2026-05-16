/// <reference types="astro/client" />

interface ImportMetaEnv {
	readonly PUBLIC_API_URL?: string;
	readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

interface TurnstileApi {
	render: (
		container: string | HTMLElement,
		options: {
			sitekey: string;
			theme?: 'light' | 'dark' | 'auto';
			callback?: (token: string) => void;
			'expired-callback'?: () => void;
			'error-callback'?: () => void;
		}
	) => string;
	reset: (widgetId?: string) => void;
}

interface Window {
	onTurnstileApiLoad?: () => void;
	turnstile?: TurnstileApi;
}
