import { MongoClient, ServerApiVersion } from 'mongodb';
import { fromNodeProviderChain, fromSSO } from '@aws-sdk/credential-providers';
import dns from 'node:dns';
import { promisify } from 'node:util';
import logger from './logger';

const dnsLookup = promisify(dns.lookup);

// SSRF Protection: Check if URL is internal/private
export async function isSafeUrl(urlStr: string) {
  try {
    const url = new URL(urlStr);
    if (url.protocol !== 'http:' && url.protocol !== 'https:' && url.protocol !== 'mongodb:' && url.protocol !== 'mongodb+srv:') return false;
    
    // For MongoDB URIs, skip DNS validation as the driver handles complex SRV/TXT resolution
    // and they are inherently less prone to the kind of SSRF targeted here (HTTP metadata services)
    if (url.protocol === 'mongodb:' || url.protocol === 'mongodb+srv:') return true;

    const hostname = url.hostname;
    if (!hostname) return true; 

    // Allow localhost/loopback and host.docker.internal for local development/integration
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === 'host.docker.internal') return true;

    const { address } = await dnsLookup(hostname);
    
    // Allow loopback and host-gateway address from DNS resolution too
    if (address === '127.0.0.1' || address === '::1') return true;

    const parts = address.split('.').map(Number);

    // SSRF protection for this tool should primarily block cloud metadata services
    // blocking 10.x, 172.x, 192.x is too aggressive for self-hosted integration tools
    if (parts[0] === 169 && parts[1] === 254) return false; // Link-local / Metadata service

    return true;
  } catch {
    return false;
  }
}

// Map to store persistent Mongo clients: cacheKey -> { client, lastUsed }
const mongoClients = new Map<string, { client: MongoClient, lastUsed: number }>();

// Cleanup idle Mongo clients every 5 minutes
let cleanupInterval: NodeJS.Timeout | null = null;

export function startMongoCleanup(intervalMs = 300000, idleTimeoutMs = 1800000) {
  if (cleanupInterval) clearInterval(cleanupInterval);
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, item] of mongoClients.entries()) {
      if (now - item.lastUsed > idleTimeoutMs) {
        item.client.close().catch(() => {});
        mongoClients.delete(key);
      }
    }
  }, intervalMs);
}

// For testing purposes
export function stopMongoCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

export function clearMongoCache() {
  for (const item of mongoClients.values()) {
    item.client.close().catch(() => {});
  }
  mongoClients.clear();
}

export function getMongoClientCount() {
  return mongoClients.size;
}

/** Evict cached MongoClients matching a given identifier (profile name or role type).
 *  Called after SSO re-login so the next getDb() creates a fresh client
 *  with new credentials. Matches by profile suffix or role prefix (app/customer). */
export function evictSsoClients(identifier: string): number {
  let evicted = 0;
  for (const [key, item] of mongoClients.entries()) {
    // Cache key format: type:uri:db:authMethod:awsAuthType:proxy:tunnel:accessKey:profile
    // Match by profile (suffix) or by role type (prefix, e.g. "app:" or "customer:")
    if (key.endsWith(`:${identifier}`) || key.startsWith(`${identifier}:`)) {
      item.client.close().catch(() => {});
      mongoClients.delete(key);
      evicted++;
      logger.info(`[MONGO] Evicted cached client for "${identifier}"`);
    }
  }
  return evicted;
}

export interface MongoConfig {
  uri: string;
  db?: string;
  use_proxy?: boolean;
  tunnel_name?: string;
  auth?: {
    method?: 'scram' | 'aws' | 'oidc';
    aws_auth_type?: 'static' | 'role' | 'sso' | 'ambient';
    static?: {
      aws_access_key: string;
      aws_secret_key: string;
      aws_session_token?: string;
    };
    role?: {
      aws_role_arn: string;
      aws_external_id?: string;
      aws_role_session_name?: string;
      aws_access_key?: string;
      aws_secret_key?: string;
      aws_session_token?: string;
    };
    sso?: {
      aws_sso_start_url: string;
      aws_sso_region: string;
      aws_sso_account_id: string;
      aws_sso_role_name: string;
      aws_access_key?: string;
      aws_secret_key?: string;
      aws_session_token?: string;
    };
    oidc_token?: string;
  };
  proxyHost?: string;
  proxyPort?: number;
  tunnels?: Record<string, { host: string, port: number }>;
}

export async function getDb(config: MongoConfig, type: 'app' | 'customer' = 'app', checkExists = false) {
  const uri = config.uri;
  if (!uri) throw new Error(`Mongo ${type} URI not provided`);
  
  if (!await isSafeUrl(uri)) {
    throw new Error(`Invalid or unsafe MongoDB ${type} URI`);
  }
  
  const dbName = config.db || (type === 'customer' ? 'customers' : 'valueStream');
  const authMethod = config.auth?.method || 'scram';
  const useProxy = !!config.use_proxy;
  const tunnelName = config.tunnel_name;

  // Create a cache key for this specific connection
  const awsAuthType = config.auth?.aws_auth_type || '';
  const awsKeyForCache = config.auth?.static?.aws_access_key || config.auth?.sso?.aws_access_key || config.auth?.role?.aws_access_key || '';
  const cacheKey = `${type}:${uri}:${dbName}:${authMethod}:${awsAuthType}:${useProxy}:${tunnelName || ''}:${awsKeyForCache}`;
  
  const cached = mongoClients.get(cacheKey);
  if (cached) {
    cached.lastUsed = Date.now();
    logger.debug(`[MONGO] Cache HIT for key: ${cacheKey.substring(0, 50)}...`);
    return cached.client.db(dbName);
  }

  logger.debug(`[MONGO] Cache MISS for key: ${cacheKey.substring(0, 50)}... - Creating new connection`);
  const startTime = Date.now();

  const options: any = {
    serverSelectionTimeoutMS: 15000,
    connectTimeoutMS: 15000,
    maxPoolSize: 10,
    minPoolSize: 1,
    serverApi: {
      version: ServerApiVersion.v1,
      strict: false,
      deprecationErrors: true,
    }
  };

  // SOCKS proxy implementation with dynamic tunnel support
  if (useProxy) {
    let effectiveHost = config.proxyHost;
    let effectivePort = config.proxyPort;

    // If a tunnel name is provided (e.g. "app", "customer"), try to resolve it from the tunnels map
    if (tunnelName && config.tunnels && config.tunnels[tunnelName.toLowerCase()]) {
      const tunnel = config.tunnels[tunnelName.toLowerCase()];
      effectiveHost = tunnel.host || effectiveHost;
      effectivePort = tunnel.port || effectivePort;
      logger.debug(`[MONGO] Using tunnel '${tunnelName}': ${effectiveHost}:${effectivePort}`);
    } else {
      logger.debug(`[MONGO] Using default proxy: ${effectiveHost}:${effectivePort}`);
    }

    if (effectiveHost && effectivePort) {
      options.proxyHost = effectiveHost;
      options.proxyPort = Number(effectivePort);
      logger.debug(`[MONGO] Proxy options applied: ${effectiveHost}:${effectivePort}`);
    }
  }

  const isSrv = uri.startsWith('mongodb+srv://');
  if (isSrv) {
    options.tls = true;
    if (useProxy && config.proxyHost) {
      options.tlsAllowInvalidHostnames = true;
    }
  }

  if (authMethod === 'aws') {
    const awsAuthType = config.auth?.aws_auth_type || 'static';

    // Common AWS auth options
    options.authMechanism = 'MONGODB-AWS';
    options.authSource = '$external';
    options.auth = { username: '', password: '' };

    // Ensure STS calls bypass the SOCKS proxy to avoid bastion restrictions.
    if (useProxy) {
      const awsEndpoints = ['sts.amazonaws.com', 'amazonaws.com', '.amazonaws.com'];
      const currentNoProxy = process.env.NO_PROXY ? process.env.NO_PROXY.split(',') : [];
      const newEndpoints = awsEndpoints.filter(ep => !currentNoProxy.includes(ep));
      if (newEndpoints.length > 0) {
        process.env.NO_PROXY = currentNoProxy.concat(newEndpoints).join(',');
      }
    }

    if (awsAuthType === 'ambient') {
      // Service's own AWS identity (IRSA / Pod Identity / EC2 instance profile / ECS task role)
      // already has MongoDB access — no settings required. Clear any lingering env vars so
      // prior auth types don't leak credentials into the provider chain.
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;
      delete process.env.AWS_SESSION_TOKEN;
      delete process.env.AWS_ROLE_ARN;
      delete process.env.AWS_ROLE_SESSION_NAME;
      delete process.env.AWS_ROLE_EXTERNAL_ID;

      options.authMechanismProperties = {
        AWS_CREDENTIAL_PROVIDER: fromNodeProviderChain()
      };
    } else if (awsAuthType === 'sso') {
      const sso = config.auth?.sso;
      const ak = sso?.aws_access_key;
      const sk = sso?.aws_secret_key;

      if (ak && sk) {
        // Credentials obtained from the SDK-based device flow
        process.env.AWS_ACCESS_KEY_ID = ak;
        process.env.AWS_SECRET_ACCESS_KEY = sk;
        if (sso?.aws_session_token) {
          process.env.AWS_SESSION_TOKEN = sso.aws_session_token;
        } else {
          delete process.env.AWS_SESSION_TOKEN;
        }
        options.authMechanismProperties = {
          AWS_CREDENTIAL_PROVIDER: fromNodeProviderChain()
        };
      } else {
        throw new Error(`AWS SSO credentials are required for SSO authentication on ${type} DB. Run "Login via AWS SSO" first.`);
      }
    } else if (awsAuthType === 'role') {
      const role = config.auth?.role;
      const roleArn = role?.aws_role_arn;

      if (!roleArn) {
        throw new Error(`AWS Role ARN is required for Assume Role authentication on ${type} DB.`);
      }

      // If explicit keys provided, set them; otherwise rely on ambient credentials (IRSA/Pod Identity)
      if (role?.aws_access_key && role?.aws_secret_key) {
        process.env.AWS_ACCESS_KEY_ID = role.aws_access_key;
        process.env.AWS_SECRET_ACCESS_KEY = role.aws_secret_key;
        if (role.aws_session_token) {
          process.env.AWS_SESSION_TOKEN = role.aws_session_token;
        } else {
          delete process.env.AWS_SESSION_TOKEN;
        }
      } else {
        delete process.env.AWS_ACCESS_KEY_ID;
        delete process.env.AWS_SECRET_ACCESS_KEY;
        delete process.env.AWS_SESSION_TOKEN;
      }

      process.env.AWS_ROLE_ARN = roleArn;
      process.env.AWS_ROLE_SESSION_NAME = role?.aws_role_session_name || `vst-${type}-session`;
      if (role?.aws_external_id) {
        process.env.AWS_ROLE_EXTERNAL_ID = role.aws_external_id;
      } else {
        delete process.env.AWS_ROLE_EXTERNAL_ID;
      }

      options.authMechanismProperties = {
        AWS_CREDENTIAL_PROVIDER: fromNodeProviderChain()
      };
    } else {
      // Static: user-provided access key / secret key / session token
      const staticAuth = config.auth?.static;
      const ak = staticAuth?.aws_access_key;
      const sk = staticAuth?.aws_secret_key;

      if (!ak || !sk) {
        throw new Error(`AWS Access Key and Secret Key are required for Static AWS IAM authentication on ${type} DB.`);
      }

      process.env.AWS_ACCESS_KEY_ID = ak;
      process.env.AWS_SECRET_ACCESS_KEY = sk;
      if (staticAuth?.aws_session_token) {
        process.env.AWS_SESSION_TOKEN = staticAuth.aws_session_token;
      } else {
        delete process.env.AWS_SESSION_TOKEN;
      }

      options.authMechanismProperties = {
        AWS_CREDENTIAL_PROVIDER: fromNodeProviderChain()
      };
    }
  } else if (authMethod === 'oidc') {
    const token = config.auth?.oidc_token;
    if (!token) {
      throw new Error(`Access Token is required for OIDC authentication on ${type} DB.`);
    }
    options.authMechanism = 'MONGODB-OIDC';
    options.authMechanismProperties = { ENVIRONMENT: 'test' };
    options.auth = { username: token, password: '' };
  }

  const client = new MongoClient(uri, options);
  await client.connect();
  
  logger.debug(`[MONGO] Connection established in ${Date.now() - startTime}ms`);

  mongoClients.set(cacheKey, { client, lastUsed: Date.now() });

  const db = client.db(dbName);

  // No need to check if database exists as MongoDB creates it on first write
  return db;
}
