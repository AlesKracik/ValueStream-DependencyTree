const SENSITIVE_FIELDS = [
  'api_token', 
  'uri', 
  'aws_access_key', 
  'aws_secret_key', 
  'aws_session_token', 
  'aws_role_arn',
  'aws_external_id',
  'aws_role_session_name',
  'aws_profile',
  'aws_sso_start_url',
  'aws_sso_region',
  'aws_sso_account_id',
  'aws_sso_role_name',
  'oidc_token', 
  'api_key'
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
