import fs from 'fs';
import path from 'path';

/** Resolve the path to settings.json in the backend directory */
export const getSettingsPath = () => path.resolve(__dirname, '../../settings.json');

/** Read raw settings.json from disk (config only after migration, full settings in legacy mode) */
export function readSettingsFile(): any {
  const settingsPath = getSettingsPath();
  if (fs.existsSync(settingsPath)) {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  }
  return {};
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
  'registration_access_token'
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

// --- Secret extraction / stripping / merging helpers ---

/**
 * Extract sensitive values from a nested settings object into a flat dot-path map.
 * E.g., { persistence: { mongo: { app: { uri: "x" } } } } → { "persistence.mongo.app.uri": "x" }
 */
export function extractSecrets(settings: any, prefix: string = ''): Record<string, string> {
  const secrets: Record<string, string> = {};
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return secrets;

  for (const [key, value] of Object.entries(settings)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
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
    const parts = dotPath.split('.');
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
