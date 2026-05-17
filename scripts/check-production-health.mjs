import { appendFile } from 'node:fs/promises';
import { normalizeSiteUrl } from './site-url.mjs';

const argv = process.argv.slice(2);

const readOptionValue = (flag) => {
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === flag) {
      return argv[index + 1];
    }
    if (current.startsWith(`${flag}=`)) {
      return current.slice(flag.length + 1);
    }
  }
  return undefined;
};

const readText = (...values) => {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
};

const readInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeComparableUrl = (value) => {
  const url = new URL(value);
  const pathname = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/u, '');
  return `${url.origin}${pathname}${url.search}`;
};

const fetchText = async (url) => {
  const response = await fetch(url, { redirect: 'follow' });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching ${url}: ${text.slice(0, 200)}`);
  }
  return text;
};

const extractScriptUrls = (html, frontendUrl) => {
  const matches = [...html.matchAll(/<script\b[^>]*\bsrc=(['"])(.*?)\1/giu)];
  const frontendOrigin = new URL(frontendUrl).origin;
  const urls = new Set();

  for (const match of matches) {
    const rawUrl = String(match[2] || '').trim();
    if (!rawUrl) continue;
    const absoluteUrl = new URL(rawUrl, frontendUrl);
    if (absoluteUrl.origin !== frontendOrigin) continue;
    if (!absoluteUrl.pathname.endsWith('.js')) continue;
    urls.add(absoluteUrl.toString());
  }

  return [...urls];
};

const extractApiUrls = (text) => {
  const matches = [...text.matchAll(/https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec/gu)];
  return [...new Set(matches.map((match) => match[0]))];
};

const extractDeploymentId = (apiUrl) => {
  const match = String(apiUrl || '').match(/\/macros\/s\/([A-Za-z0-9_-]+)\/exec/u);
  return match ? match[1] : '';
};

const collectLiveFrontendTarget = async (frontendUrl) => {
  const html = await fetchText(frontendUrl);
  const scriptUrls = extractScriptUrls(html, frontendUrl);

  if (scriptUrls.length === 0) {
    throw new Error(`No JavaScript assets found in live frontend HTML: ${frontendUrl}`);
  }

  const matchedBundles = [];

  for (const scriptUrl of scriptUrls) {
    const bundleText = await fetchText(scriptUrl);
    const apiUrls = extractApiUrls(bundleText);
    if (apiUrls.length === 0) continue;
    matchedBundles.push({ scriptUrl, apiUrls });
  }

  const distinctApiUrls = [...new Set(matchedBundles.flatMap((bundle) => bundle.apiUrls))];

  if (distinctApiUrls.length === 0) {
    throw new Error(`No Apps Script exec URL found in live frontend bundles for ${frontendUrl}`);
  }

  if (distinctApiUrls.length > 1) {
    throw new Error(`Multiple Apps Script exec URLs found in live frontend bundles: ${distinctApiUrls.join(', ')}`);
  }

  return {
    frontendUrl: normalizeSiteUrl(frontendUrl),
    htmlScriptUrls: scriptUrls,
    matchedBundleUrls: matchedBundles.map((bundle) => bundle.scriptUrl),
    liveApiUrl: distinctApiUrls[0],
    liveDeploymentId: extractDeploymentId(distinctApiUrls[0])
  };
};

const fetchRuntimeStatus = async (apiUrl) => {
  const url = new URL(apiUrl);
  url.searchParams.set('action', 'runtime_config_status');
  url.searchParams.set('_healthcheck', String(Date.now()));

  const response = await fetch(url, { redirect: 'follow' });
  const text = await response.text();

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Runtime status did not return JSON: ${text.slice(0, 200)}`);
  }

  if (!response.ok) {
    throw new Error(`Runtime status HTTP ${response.status}: ${text.slice(0, 200)}`);
  }

  return json;
};

const writeStepSummary = async (status, summary, errors) => {
  const filePath = process.env.GITHUB_STEP_SUMMARY;
  if (!filePath) return;

  const lines = [
    '## Production Health Check',
    '',
    `- Status: ${status}`
  ];

  if (summary) {
    lines.push(`- Frontend URL: ${summary.frontendUrl}`);
    lines.push(`- Live API URL: ${summary.liveApiUrl || 'n/a'}`);
    lines.push(`- Expected API URL: ${summary.expectedApiUrl || 'n/a'}`);
    lines.push(`- Live Deployment ID: ${summary.liveDeploymentId || 'n/a'}`);
    lines.push(`- Expected Deployment ID: ${summary.expectedDeploymentId || 'n/a'}`);
    lines.push(`- Runtime Environment: ${String(summary.runtimeStatus?.environment || 'n/a')}`);
    lines.push(`- Runtime Public Site URL: ${String(summary.runtimeStatus?.publicSiteUrl || 'n/a')}`);
    if (Array.isArray(summary.matchedBundleUrls) && summary.matchedBundleUrls.length > 0) {
      lines.push(`- Matched Bundle: ${summary.matchedBundleUrls.join(', ')}`);
    }
  }

  if (errors.length > 0) {
    lines.push('');
    lines.push('### Errors');
    lines.push('');
    for (const error of errors) {
      lines.push(`- ${error}`);
    }
  }

  lines.push('');
  await appendFile(filePath, `${lines.join('\n')}\n`, 'utf8');
};

const createFailure = (message, extra = {}) => Object.assign(new Error(message), extra);

const asRecord = (value) => {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
};

const frontendUrl = readText(
  readOptionValue('--frontend-url'),
  process.env.HEALTHCHECK_FRONTEND_URL,
  process.env.GAS_PUBLIC_SITE_URL,
  process.env.PUBLIC_SITE_URL
);
const expectedDeploymentId = readText(
  readOptionValue('--expected-deployment-id'),
  process.env.EXPECTED_GAS_DEPLOYMENT_ID,
  process.env.GAS_DEPLOYMENT_ID
);
const expectedApiUrl = readText(
  readOptionValue('--expected-api-url'),
  process.env.EXPECTED_API_URL,
  expectedDeploymentId ? `https://script.google.com/macros/s/${expectedDeploymentId}/exec` : ''
);
const expectedEnvironment = readText(
  readOptionValue('--expected-environment'),
  process.env.EXPECTED_RUNTIME_ENVIRONMENT,
  'production'
);
const expectedPublicSiteUrl = normalizeSiteUrl(
  readText(
    readOptionValue('--expected-public-site-url'),
    process.env.EXPECTED_PUBLIC_SITE_URL,
    process.env.GAS_PUBLIC_SITE_URL,
    process.env.PUBLIC_SITE_URL,
    frontendUrl
  )
);
const retries = readInt(readOptionValue('--retries') ?? process.env.HEALTHCHECK_RETRIES, 0);
const retryDelayMs = readInt(readOptionValue('--retry-delay-ms') ?? process.env.HEALTHCHECK_RETRY_DELAY_MS, 5000);

if (!expectedApiUrl) {
  throw new Error('Missing expected GAS API target. Provide --expected-deployment-id or --expected-api-url.');
}

if (!frontendUrl) {
  throw new Error('Missing required frontend URL for production health check.');
}

const runOnce = async () => {
  const liveTarget = await collectLiveFrontendTarget(frontendUrl);
  const runtimeStatus = await fetchRuntimeStatus(liveTarget.liveApiUrl);
  const runtimeStatusRecord = asRecord(runtimeStatus);
  const summary = {
    checkedAt: new Date().toISOString(),
    frontendUrl: liveTarget.frontendUrl,
    matchedBundleUrls: liveTarget.matchedBundleUrls,
    liveApiUrl: liveTarget.liveApiUrl,
    liveDeploymentId: liveTarget.liveDeploymentId,
    expectedApiUrl,
    expectedDeploymentId,
    expectedEnvironment,
    expectedPublicSiteUrl,
    runtimeStatus
  };
  const errors = [];

  if (normalizeComparableUrl(liveTarget.liveApiUrl) !== normalizeComparableUrl(expectedApiUrl)) {
    errors.push(`live frontend points to unexpected GAS API: expected ${expectedApiUrl} but found ${liveTarget.liveApiUrl}`);
  }

  if (expectedDeploymentId && liveTarget.liveDeploymentId !== expectedDeploymentId) {
    errors.push(
      `live frontend deployment id mismatch: expected ${expectedDeploymentId} but found ${liveTarget.liveDeploymentId}`
    );
  }

  if (!runtimeStatusRecord || runtimeStatusRecord.success !== true) {
    errors.push(`runtime_config_status returned unexpected payload: ${JSON.stringify(runtimeStatus)}`);
  }

  if (runtimeStatusRecord) {
    if (String(runtimeStatusRecord.environment || '') !== expectedEnvironment) {
      errors.push(
        `runtime environment mismatch: expected ${expectedEnvironment} but found ${String(runtimeStatusRecord.environment || '')}`
      );
    }

    if (normalizeSiteUrl(readText(runtimeStatusRecord.publicSiteUrl)) !== expectedPublicSiteUrl) {
      errors.push(
        `runtime public site url mismatch: expected ${expectedPublicSiteUrl} but found ${String(runtimeStatusRecord.publicSiteUrl || '')}`
      );
    }
  }

  if (errors.length > 0) {
    throw createFailure(errors[0], { summary, validationErrors: errors });
  }

  return summary;
};

let lastFailure = null;
const totalAttempts = retries + 1;

for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
  try {
    const summary = await runOnce();
    console.log(JSON.stringify({ success: true, attempt, summary }, null, 2));
    await writeStepSummary('success', summary, []);
    process.exit(0);
  } catch (error) {
    lastFailure = error;
    console.error(`[production-health] attempt ${attempt}/${totalAttempts} failed: ${error.message}`);
    if (attempt < totalAttempts) {
      await sleep(retryDelayMs);
    }
  }
}

const failureErrors = Array.isArray(lastFailure?.validationErrors)
  ? lastFailure.validationErrors
  : [lastFailure?.message || 'unknown production health check failure'];
const failureSummary = lastFailure?.summary || null;

console.log(JSON.stringify({ success: false, errors: failureErrors, summary: failureSummary }, null, 2));
await writeStepSummary('failure', failureSummary, failureErrors);
throw createFailure(failureErrors[0]);