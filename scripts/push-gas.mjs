import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  buildGasScriptProperties,
  commandExistsFlag,
  envProfileFromAppEnv,
  loadAppEnv,
  readEnvText,
  readOptionValue,
  requireEnvText,
  resolveAppEnv
} from './env-utils.mjs';

const rootDir = process.cwd();
const gasDir = path.join(rootDir, 'gas');
const argv = process.argv.slice(2);
const appEnv = resolveAppEnv(argv);
const profile = envProfileFromAppEnv(appEnv);
const env = loadAppEnv(rootDir, appEnv);
const dryRun = commandExistsFlag(argv, '--dry-run');
const deployAfterPush = commandExistsFlag(argv, '--deploy');

const scriptId = requireEnvText(env, 'GAS_SCRIPT_ID', 'Missing required GAS env');
requireEnvText(env, 'GAS_PUBLIC_SITE_URL', 'Missing required GAS env');
requireEnvText(env, 'GAS_ENFORCE_CAPTCHA', 'Missing required GAS env');
requireEnvText(env, 'GAS_ENFORCE_ACCESS_CONTROL', 'Missing required GAS env');

if (readEnvText(env, 'GAS_ENFORCE_CAPTCHA').toLowerCase() === 'true') {
  requireEnvText(env, 'GAS_TURNSTILE_SECRET', 'Missing required GAS env when captcha is enabled');
}

const gasProperties = buildGasScriptProperties(env);
const deploymentId = readEnvText(env, 'GAS_DEPLOYMENT_ID');
const deploymentDescription =
  readOptionValue(argv, '--description')?.trim() ||
  readEnvText(env, 'GAS_DEPLOYMENT_DESCRIPTION') ||
  `shortyou-backend-${appEnv}`;
const frontendApiUrl = readEnvText(env, 'PUBLIC_API_URL');
const runtimeConfigSignature = createHash('sha256')
  .update(JSON.stringify({ environment: appEnv, propertyMap: gasProperties }))
  .digest('hex');
const runtimeConfigFilePath = path.join(gasDir, 'SyncConfig.js');

const commandName = (base) => (process.platform === 'win32' ? `${base}.cmd` : base);

const resolveClaspCommand = () => {
  const direct = spawnSync(commandName('clasp'), ['--version'], {
    cwd: rootDir,
    stdio: 'ignore',
    env: process.env
  });

  if (direct.status === 0) {
    return { command: commandName('clasp'), prefixArgs: [] };
  }

  const npx = spawnSync(commandName('npx'), ['--yes', '@google/clasp', '--version'], {
    cwd: rootDir,
    stdio: 'ignore',
    env: process.env
  });

  if (npx.status === 0) {
    return { command: commandName('npx'), prefixArgs: ['--yes', '@google/clasp'] };
  }

  throw new Error('Unable to find clasp. Install it globally or allow npx to run @google/clasp.');
};

const claspRunner = resolveClaspCommand();

const run = (command, args, cwd) => {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...env,
      SHORTYOU_ENV: appEnv
    }
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
};

const runClasp = (args, cwd) => {
  run(claspRunner.command, [...claspRunner.prefixArgs, ...args], cwd);
};

const writeClaspConfig = async () => {
  const filePath = path.join(gasDir, '.clasp.json');
  const content = JSON.stringify(
    {
      scriptId,
      rootDir: './',
      filePushOrder: ['SyncConfig.js', 'Code.js']
    },
    null,
    2
  );
  await writeFile(filePath, `${content}\n`, 'utf8');
};

const writeRuntimeConfigBootstrap = async () => {
  const payload = {
    environment: appEnv,
    signature: runtimeConfigSignature,
    propertyMap: gasProperties
  };
  const content = `var __SHORTYOU_PENDING_RUNTIME_CONFIG = ${JSON.stringify(payload)};\n`;
  await writeFile(runtimeConfigFilePath, content, 'utf8');
};

const triggerRuntimeConfigSync = async () => {
  if (!frontendApiUrl) {
    return { skipped: true, reason: 'missing_public_api_url' };
  }

  const url = new URL(frontendApiUrl);
  url.searchParams.set('action', 'runtime_config_status');
  url.searchParams.set('_sync', String(Date.now()));

  const response = await fetch(url, { redirect: 'follow' });
  const text = await response.text();

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Runtime config status did not return JSON: ${text.slice(0, 200)}`);
  }

  if (!response.ok) {
    throw new Error(`Runtime config status HTTP ${response.status}: ${text.slice(0, 200)}`);
  }

  if (!json || json.success !== true) {
    throw new Error(`Runtime config status failed: ${text.slice(0, 200)}`);
  }

  if (String(json.signature || '') !== runtimeConfigSignature) {
    throw new Error(
      `Runtime config signature mismatch. expected=${runtimeConfigSignature} actual=${String(json.signature || '')}`
    );
  }

  return json;
};

const summarizeProperties = () => {
  const entries = Object.entries(gasProperties).map(([key, value]) => ({
    key,
    action: value === null ? 'delete' : 'set'
  }));
  return entries;
};

await writeClaspConfig();
await writeRuntimeConfigBootstrap();

if (dryRun) {
  console.log(
    JSON.stringify(
      {
        environment: appEnv,
        profile,
        scriptId,
        deployAfterPush,
        deploymentId: deploymentId || null,
        deploymentDescription: deployAfterPush ? deploymentDescription : null,
        runtimeConfigSignature,
        gasProperties: summarizeProperties()
      },
      null,
      2
    )
  );
  process.exit(0);
}

run(commandName('npm'), ['run', 'build:gas'], rootDir);
runClasp(['push', '--force'], gasDir);

if (deployAfterPush) {
  const deployArgs = ['deploy', '--description', deploymentDescription];
  if (deploymentId) {
    deployArgs.push('--deploymentId', deploymentId);
  }
  runClasp(deployArgs, gasDir);
  const syncStatus = await triggerRuntimeConfigSync();
  console.log(`[gas:sync] ${appEnv} ${JSON.stringify(syncStatus)}`);
  console.log(`[gas:deploy] ${appEnv} deploy completed.`);
} else {
  console.log(
    `[gas:push] ${appEnv} push completed. Runtime config will be applied on next deployed request or manual script execution.`
  );
}