import { MongoClient, ServerApiVersion } from 'mongodb';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import dns from 'node:dns';
import { promisify } from 'node:util';

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

export interface MongoConfig {
  [key: string]: any;
  proxyHost?: string;
  proxyPort?: number;
  tunnels?: Record<string, { host: string, port: number }>;
}

export async function getDb(config: MongoConfig, type: 'app' | 'customer' = 'app', checkExists = false) {
  const prefix = type === 'customer' ? 'customer_mongo_' : 'mongo_';

  const uri = config[prefix + 'uri'];
  if (!uri) throw new Error(`Mongo ${type} URI not provided`);
  
  if (!await isSafeUrl(uri)) {
    throw new Error(`Invalid or unsafe MongoDB ${type} URI`);
  }
  
  const dbName = config[prefix + 'db'] || (type === 'customer' ? 'customer' : 'valueStream');
  const authMethod = config[prefix + 'auth_method'] || 'scram';
  const useProxy = !!config[prefix + 'use_proxy'];
  const tunnelName = config[prefix + 'tunnel_name'];

  // Create a cache key for this specific connection
  const cacheKey = `${type}:${uri}:${dbName}:${authMethod}:${useProxy}:${tunnelName || ''}:${config[prefix + 'aws_access_key'] || ''}`;
  
  const cached = mongoClients.get(cacheKey);
  if (cached) {
    cached.lastUsed = Date.now();
    // MONGO_DEBUG: Log cache hit
    console.log(`[MONGO_DEBUG] Cache HIT for key: ${cacheKey.substring(0, 50)}...`);
    return cached.client.db(dbName);
  }

  // MONGO_DEBUG: Log cache miss / new connection
  console.log(`[MONGO_DEBUG] Cache MISS for key: ${cacheKey.substring(0, 50)}... - Creating new connection`);
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
      console.log(`[MONGO_DEBUG] Using tunnel '${tunnelName}': ${effectiveHost}:${effectivePort}`);
    } else {
      console.log(`[MONGO_DEBUG] Using default proxy: ${effectiveHost}:${effectivePort}`);
    }

    if (effectiveHost && effectivePort) {
      options.proxyHost = effectiveHost;
      options.proxyPort = Number(effectivePort);
      options.proxyUsername = '';
      options.proxyPassword = '';
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
    const ak = config[prefix + 'aws_access_key'];
    const sk = config[prefix + 'aws_secret_key'];
    const st = config[prefix + 'aws_session_token'];
    
    if (!ak || !sk) {
      throw new Error(`AWS Access Key and Secret Key are required for AWS IAM authentication on ${type} DB.`);
    }

    // Set environment variables for AWS SDK to pick up
    process.env.AWS_ACCESS_KEY_ID = ak;
    process.env.AWS_SECRET_ACCESS_KEY = sk;
    if (st) {
      process.env.AWS_SESSION_TOKEN = st;
    } else {
      delete process.env.AWS_SESSION_TOKEN;
    }

    // Ensure STS calls bypass the SOCKS proxy to avoid bastion restrictions.
    if (useProxy) {
      // Use both specific and suffix-based endpoints for broad compatibility
      const awsEndpoints = ['sts.amazonaws.com', 'amazonaws.com', '.amazonaws.com'];
      const currentNoProxy = process.env.NO_PROXY ? process.env.NO_PROXY.split(',') : [];
      const newEndpoints = awsEndpoints.filter(ep => !currentNoProxy.includes(ep));
      
      if (newEndpoints.length > 0) {
        process.env.NO_PROXY = currentNoProxy.concat(newEndpoints).join(',');
      }
    }

    options.authMechanism = 'MONGODB-AWS';
    options.authSource = '$external';
    options.auth = { username: '', password: '' };

    // Use the official AWS SDK provider chain. This supports:
    // 1. Environment variables (set from UI above)
    // 2. IAM Roles (EC2/ECS/EKS)
    // 3. AWS Config files / SSO
    options.authMechanismProperties = {
      AWS_CREDENTIAL_PROVIDER: fromNodeProviderChain()
    };
  } else if (authMethod === 'oidc') {
    const token = config[prefix + 'oidc_token'];
    if (!token) {
      throw new Error(`Access Token is required for OIDC authentication on ${type} DB.`);
    }
    options.authMechanism = 'MONGODB-OIDC';
    options.authMechanismProperties = { ENVIRONMENT: 'test' };
    options.auth = { username: token, password: '' };
  }

  const client = new MongoClient(uri, options);
  await client.connect();
  
  // MONGO_DEBUG: Log connection time
  console.log(`[MONGO_DEBUG] MongoDB connection established in ${Date.now() - startTime}ms`);

  mongoClients.set(cacheKey, { client, lastUsed: Date.now() });

  const db = client.db(dbName);

  // No need to check if database exists as MongoDB creates it on first write
  return db;
}
