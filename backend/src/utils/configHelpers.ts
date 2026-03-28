import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { FastifyInstance } from 'fastify';

/** Resolve the path to settings.json in the backend directory */
export const getSettingsPath = () => path.resolve(__dirname, '../../settings.json');

/** Read raw settings.json from disk synchronously (used only at startup / migration) */
export function readSettingsFile(): any {
  const settingsPath = getSettingsPath();
  if (fs.existsSync(settingsPath)) {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  }
  return {};
}

/** Async version of readSettingsFile — uses fs.promises to avoid blocking the event loop */
export async function readSettingsFileAsync(): Promise<any> {
  const settingsPath = getSettingsPath();
  try {
    const content = await fsPromises.readFile(settingsPath, 'utf-8');
    return JSON.parse(content);
  } catch (e: any) {
    if (e.code === 'ENOENT') return {};
    throw e;
  }
}

export const SENSITIVE_FIELDS = [
  'api_token',
  'uri',
  'aws_access_key',
  'aws_secret_key',
  'aws_session_token',
  'oidc_token',
  'api_key',
  'access_token',
  'refresh_token',
  'client_secret',
  'registration_access_token',
  'bind_password'
];

const MASK = '********';

export function maskSettings(settings: any): any {
  if (!settings || typeof settings !== 'object') return settings;
  const masked = Array.isArray(settings) ? [...settings] : { ...settings };
  
  Object.keys(masked).forEach(key => {
    if (SENSITIVE_FIELDS.includes(key) && masked[key] && typeof masked[key] === 'string') {
      masked[key] = MASK;
    } else if (typeof masked[key] === 'object' && masked[key] !== null) {
      masked[key] = maskSettings(masked[key]);
    }
  });

  return masked;
}

export function unmaskSettings(newData: any, existingSettings: any): any {
  if (!newData || typeof newData !== 'object') return newData;
  if (!existingSettings || typeof existingSettings !== 'object') return newData;

  const unmasked = Array.isArray(newData) ? [...newData] : { ...newData };
  
  // First, bring in any keys from existingSettings that aren't in newData
  Object.keys(existingSettings).forEach(key => {
    if (!(key in unmasked)) {
      unmasked[key] = existingSettings[key];
    }
  });

  Object.keys(unmasked).forEach(key => {
    const newVal = unmasked[key];
    const oldVal = existingSettings[key];

    if (SENSITIVE_FIELDS.includes(key) && newVal === MASK) {
      unmasked[key] = oldVal !== undefined ? oldVal : MASK;
    } else if (typeof newVal === 'object' && newVal !== null) {
      unmasked[key] = unmaskSettings(newVal, oldVal);
    }
  });

  return unmasked;
}

/**
 * Resolve integration config: fetches stored settings, unmasks raw config against them,
 * optionally extracts a named section and validates required fields.
 *
 * @param fastify  - Fastify instance (for getSettings decorator)
 * @param rawConfig - Raw config from request body (may contain masked values)
 * @param section  - Optional top-level key to extract (e.g. 'jira', 'aha', 'ai')
 * @param requiredFields - Optional array of [fieldName, errorLabel] tuples to validate
 * @returns { full, section } - full merged config and the extracted section
 */
export async function getIntegrationConfig(
  fastify: FastifyInstance,
  rawConfig: any,
  section?: string,
  requiredFields?: [string, string][]
): Promise<{ full: any; section: any }> {
  const existing = await fastify.getSettings();
  const config = unmaskSettings(rawConfig, existing);
  const sectionData = section ? (config[section] || {}) : config;

  if (requiredFields) {
    for (const [field, label] of requiredFields) {
      if (!sectionData[field]) {
        throw new Error(`${label} is not configured in settings.`);
      }
    }
  }

  return { full: config, section: sectionData };
}

// --- Secret extraction / stripping / merging helpers ---

// Dot-path encoding: dots within key names are escaped as \. so they are not
// confused with the path separator.  E.g., the key "https://a.b.com" becomes
// "https://a\.b\.com" in the dot-path.
function escapeKey(key: string): string {
  return key.replace(/\\/g, '\\\\').replace(/\./g, '\\.');
}

/**
 * Split a dot-path into its constituent key segments, respecting escaped dots.
 * E.g., "a.b\\.c.d" → ["a", "b.c", "d"]
 */
export function splitDotPath(dotPath: string): string[] {
  const parts: string[] = [];
  let current = '';
  for (let i = 0; i < dotPath.length; i++) {
    if (dotPath[i] === '\\' && i + 1 < dotPath.length) {
      // Escaped character — take the next char literally
      current += dotPath[i + 1];
      i++;
    } else if (dotPath[i] === '.') {
      parts.push(current);
      current = '';
    } else {
      current += dotPath[i];
    }
  }
  parts.push(current);
  return parts;
}

/**
 * Extract sensitive values from a nested settings object into a flat dot-path map.
 * E.g., { persistence: { mongo: { app: { uri: "x" } } } } → { "persistence.mongo.app.uri": "x" }
 * Keys containing dots are escaped (e.g., "https://a.b.com" → "https://a\\.b\\.com").
 */
export function extractSecrets(settings: any, prefix: string = ''): Record<string, string> {
  const secrets: Record<string, string> = {};
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return secrets;

  for (const [key, value] of Object.entries(settings)) {
    const escapedKey = escapeKey(key);
    const fullPath = prefix ? `${prefix}.${escapedKey}` : escapedKey;
    if (SENSITIVE_FIELDS.includes(key) && typeof value === 'string' && value && value !== MASK) {
      secrets[fullPath] = value;
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(secrets, extractSecrets(value, fullPath));
    }
  }
  return secrets;
}

/**
 * Remove sensitive field values from a settings object (deletes the keys).
 * Returns a deep copy with secrets removed.
 */
export function stripSecrets(settings: any): any {
  if (!settings || typeof settings !== 'object') return settings;
  const stripped = Array.isArray(settings) ? [...settings] : { ...settings };

  for (const key of Object.keys(stripped)) {
    if (SENSITIVE_FIELDS.includes(key) && typeof stripped[key] === 'string') {
      delete stripped[key];
    } else if (typeof stripped[key] === 'object' && stripped[key] !== null) {
      stripped[key] = stripSecrets(stripped[key]);
    }
  }
  return stripped;
}

/**
 * Merge a flat secret map back into a nested settings object.
 * E.g., mergeSecrets({}, { "persistence.mongo.app.uri": "x" })
 *   → { persistence: { mongo: { app: { uri: "x" } } } }
 */
export function mergeSecrets(settings: any, secrets: Record<string, string>): any {
  const merged = JSON.parse(JSON.stringify(settings)); // deep clone
  for (const [dotPath, value] of Object.entries(secrets)) {
    const parts = splitDotPath(dotPath);
    let current = merged;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
  }
  return merged;
}

export const augmentConfig = (config: any, role: 'app' | 'customer' = 'app') => {
  const tunnels: Record<string, any> = {};
  const env = process.env;
  
  Object.keys(env).forEach(key => {
    if (key.endsWith('_SOCKS_PORT')) {
      const name = key.replace('_SOCKS_PORT', '').toLowerCase();
      const port = parseInt(env[key] || '');
      if (!isNaN(port)) {
        tunnels[name] = {
          host: env.SOCKS_PROXY_HOST || env.VITE_SOCKS_PROXY_HOST || 'localhost',
          port: port
        };
      }
    }
  });

  const mongo = config.persistence?.mongo?.[role] || {};
  
  return {
      ...mongo,
      proxyHost: env.SOCKS_PROXY_HOST || env.VITE_SOCKS_PROXY_HOST,
      proxyPort: parseInt(env.SOCKS_PROXY_PORT || env.VITE_SOCKS_PROXY_PORT || '1080'),
      tunnels
  };
};

export const calculateQuarter = (dateStr: string, fiscalYearStartMonth: number) => {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1; // 1-12
  const adjustedMonth = (month - fiscalYearStartMonth + 12) % 12;
  const quarter = Math.floor(adjustedMonth / 3) + 1;
  const year = date.getFullYear();
  const fiscalYear = month < fiscalYearStartMonth ? year : year + 1;
  return `FY${String(fiscalYear).slice(2)}Q${quarter}`;
};

export async function logQuery<T>(name: string, collection: string, op: string, promise: Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    const res = await promise;
    const count = Array.isArray(res) ? res.length : (res ? 1 : 0);
    console.log(`[MONGO] ${name} (${collection}.${op}) took ${Date.now() - start}ms (${count} docs)`);
    return res;
  } catch (e) {
    console.error(`[MONGO] ${name} (${collection}.${op}) FAILED after ${Date.now() - start}ms`, e);
    throw e;
  }
}
