import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const readText = (...values) => {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
};

export const normalizeSiteUrl = (value) => {
  const text = readText(value);
  if (!text) return '';

  const url = new URL(text);
  const pathname = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/u, '');
  return `${url.origin}${pathname}`;
};

export const resolvePublicSiteUrl = (env = process.env) => {
  return normalizeSiteUrl(
    readText(env.PUBLIC_SITE_URL, env.GAS_PUBLIC_SITE_URL, env.HEALTHCHECK_FRONTEND_URL)
  );
};

export const requirePublicSiteUrl = (env = process.env, prefix = 'Missing required public site URL env') => {
  const siteUrl = resolvePublicSiteUrl(env);
  if (!siteUrl) {
    throw new Error(`${prefix}: PUBLIC_SITE_URL or GAS_PUBLIC_SITE_URL`);
  }
  return siteUrl;
};

export const buildCnameText = (siteUrl) => `${new URL(normalizeSiteUrl(siteUrl)).hostname}\n`;

export const buildRobotsTxt = (siteUrl) => {
  const normalizedSiteUrl = normalizeSiteUrl(siteUrl);
  return `User-agent: *\nAllow: /\n\nSitemap: ${normalizedSiteUrl}/sitemap-index.xml\n`;
};

export const writeFrontendSiteArtifacts = async (outDir, siteUrl) => {
  const normalizedSiteUrl = normalizeSiteUrl(siteUrl);
  if (!normalizedSiteUrl) {
    throw new Error('Missing required public site URL when generating frontend site artifacts.');
  }

  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'CNAME'), buildCnameText(normalizedSiteUrl), 'utf8');
  await writeFile(path.join(outDir, 'robots.txt'), buildRobotsTxt(normalizedSiteUrl), 'utf8');
};