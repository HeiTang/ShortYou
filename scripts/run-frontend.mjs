import { spawnSync } from 'node:child_process';
import { loadAppEnv, omitOption, requireEnvText, resolveAppEnv } from './env-utils.mjs';

const rootDir = process.cwd();
const argv = process.argv.slice(2);
const astroCommand = argv[0];
const supportedCommands = new Set(['dev', 'build', 'preview']);

if (!astroCommand || !supportedCommands.has(astroCommand)) {
  throw new Error('Usage: node scripts/run-frontend.mjs <dev|build|preview> [--env local|production]');
}

const commandArgs = argv.slice(1);
const defaultEnv = astroCommand === 'dev' ? 'local' : 'production';
const appEnv = resolveAppEnv(commandArgs, { defaultEnv });
const env = loadAppEnv(rootDir, appEnv);

requireEnvText(env, 'PUBLIC_API_URL', 'Missing required frontend env');
requireEnvText(env, 'PUBLIC_TURNSTILE_SITE_KEY', 'Missing required frontend env');

const astroArgs = omitOption(commandArgs, '--env');
const commandName = (base) => (process.platform === 'win32' ? `${base}.cmd` : base);
const childEnv = {
  ...process.env,
  ...env,
  SHORTYOU_ENV: appEnv
};

const result = spawnSync(commandName('astro'), [astroCommand, ...astroArgs], {
  cwd: rootDir,
  stdio: 'inherit',
  env: childEnv
});

if (result.status !== 0) {
  throw new Error(`Frontend command failed: astro ${astroCommand}`);
}