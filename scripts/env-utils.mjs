import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const VALID_APP_ENVS = new Set(['local', 'production']);
const ENV_PROFILE_BY_APP_ENV = {
  local: 'dev',
  production: 'prod'
};

export const GAS_PROPERTY_MAPPINGS = [
  ['GAS_TURNSTILE_SECRET', 'TURNSTILE_SECRET'],
  ['GAS_ENFORCE_CAPTCHA', 'ENFORCE_CAPTCHA'],
  ['GAS_ENFORCE_ACCESS_CONTROL', 'ENFORCE_ACCESS_CONTROL'],
  ['GAS_PUBLIC_SITE_URL', 'PUBLIC_SITE_URL'],
  ['GAS_SHORT_LINKS_SHEET_NAME', 'SHORT_LINKS_SHEET_NAME'],
  ['GAS_CLIENTS_SHEET_NAME', 'CLIENTS_SHEET_NAME'],
  ['GAS_AUDIT_LOGS_SHEET_NAME', 'AUDIT_LOGS_SHEET_NAME'],
  ['GAS_DEFAULT_DAILY_QUOTA', 'DEFAULT_DAILY_QUOTA'],
  ['GAS_RESERVED_ALIASES', 'RESERVED_ALIASES'],
  ['GAS_MAX_URL_LENGTH', 'MAX_URL_LENGTH'],
  ['GAS_RANDOM_ALIAS_INITIAL_LENGTH', 'RANDOM_ALIAS_INITIAL_LENGTH'],
  ['GAS_RANDOM_ALIAS_MAX_LENGTH', 'RANDOM_ALIAS_MAX_LENGTH'],
  ['GAS_RANDOM_ALIAS_TRY_PER_LENGTH', 'RANDOM_ALIAS_TRY_PER_LENGTH'],
  ['GAS_CAPABILITY_TOKEN_LENGTH', 'CAPABILITY_TOKEN_LENGTH']
];

const stripQuotes = (value) => {
  if (value.length < 2) return value;
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
};

const parseEnvFile = (filePath) => {
  const text = readFileSync(filePath, 'utf8');
  const output = {};

  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    const value = stripQuotes(line.slice(separatorIndex + 1).trim());
    if (!key) continue;
    output[key] = value;
  }

  return output;
};

export const readOptionValue = (argv, flag) => {
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

export const omitOption = (argv, flag) => {
  const output = [];

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === flag) {
      index += 1;
      continue;
    }
    if (current.startsWith(`${flag}=`)) {
      continue;
    }
    output.push(current);
  }

  return output;
};

export const resolveAppEnv = (argv, options = {}) => {
  const explicitEnv = readOptionValue(argv, '--env');
  const fallbackEnv = options.defaultEnv ?? process.env.SHORTYOU_ENV;
  const envName = (explicitEnv ?? fallbackEnv ?? '').trim().toLowerCase();

  if (!envName) {
    throw new Error('Missing required environment. Use --env local or --env production.');
  }
  if (!VALID_APP_ENVS.has(envName)) {
    throw new Error(`Unsupported environment: ${envName}. Use local or production.`);
  }

  return envName;
};

export const envProfileFromAppEnv = (appEnv) => ENV_PROFILE_BY_APP_ENV[appEnv] ?? 'dev';

export const loadAppEnv = (rootDir, appEnv) => {
  const env = {};
  const profile = envProfileFromAppEnv(appEnv);
  const fileNames = ['.env', `.env.${profile}`];

  for (const fileName of fileNames) {
    const filePath = path.join(rootDir, fileName);
    if (!existsSync(filePath)) continue;
    Object.assign(env, parseEnvFile(filePath));
  }

  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    env[key] = value;
  }

  return env;
};

export const readEnvText = (env, key) => {
  const value = env[key];
  if (value === undefined || value === null) return '';
  return String(value).trim();
};

export const requireEnvText = (env, key, prefix = 'Missing required env') => {
  const value = readEnvText(env, key);
  if (!value) {
    throw new Error(`${prefix}: ${key}`);
  }
  return value;
};

export const buildGasScriptProperties = (env) => {
  const propertyMap = {};

  for (const [envKey, scriptPropertyKey] of GAS_PROPERTY_MAPPINGS) {
    const text = readEnvText(env, envKey);
    propertyMap[scriptPropertyKey] = text || null;
  }

  return propertyMap;
};

export const commandExistsFlag = (argv, flag) => argv.includes(flag);