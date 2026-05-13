/// <reference types="astro/client" />

interface Window {
	__SHORTYOU_CONFIG__: {
		api: string;
		recaptchaSiteKey?: string;
	};
	verifyCallback?: (token: string) => void;
}
