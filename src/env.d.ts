/// <reference types="astro/client" />

interface Window {
	verifyCallback?: (token: string) => void;
}
