import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import { requirePublicSiteUrl } from './scripts/site-url.mjs';

export default defineConfig({
  site: requirePublicSiteUrl(process.env, 'Missing required site URL for Astro config'),
  integrations: [tailwind()]
});
