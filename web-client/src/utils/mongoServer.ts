import { MongoClient, ServerApiVersion } from 'mongodb';

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

export async function getDb(config: any, type: 'app' | 'customer' = 'app', checkExists = false) {
  const prefix = type === 'customer' ? 'customer_mongo_' : 'mongo_';

  const uri = config[prefix + 'uri'];
  if (!uri) throw new Error(`Mongo ${type} URI not provided`);
  
  const dbName = config[prefix + 'db'] || (type === 'customer' ? 'customer' : 'valueStream');
  const authMethod = config[prefix + 'auth_method'] || 'scram';
  const useProxy = !!config[prefix + 'use_proxy'];

  // Create a cache key for this specific connection
  const cacheKey = `${type}:${uri}:${dbName}:${authMethod}:${useProxy}:${config[prefix + 'aws_access_key'] || ''}`;
  
  const cached = mongoClients.get(cacheKey);
  if (cached) {
    cached.lastUsed = Date.now();
    return cached.client.db(dbName);
  }

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

  // Proxy settings (passed from env in vite.config.ts)
  if (useProxy && config.proxyHost) {
    options.proxyHost = config.proxyHost;
    options.proxyPort = config.proxyPort;
  }

  const isSrv = uri.startsWith('mongodb+srv://');
  if (isSrv) {
    options.tls = true;
    if (options.proxyHost) {
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
    options.authMechanism = 'MONGODB-AWS';
    options.authMechanismProperties = {
      AWS_ACCESS_KEY_ID: ak,
      AWS_SECRET_ACCESS_KEY: sk,
      AWS_SESSION_TOKEN: st
    };
    options.auth = { username: '', password: '' };
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
  
  mongoClients.set(cacheKey, { client, lastUsed: Date.now() });

  const db = client.db(dbName);

  if (checkExists && !config[prefix + 'create_if_not_exists']) {
    try {
      const collections = await db.listCollections().toArray();
      if (collections.length === 0) {
        try {
          const dbs = await client.db().admin().listDatabases();
          const exists = dbs.databases.some((d: any) => d.name === dbName);
          if (!exists) {
             throw new Error(`Database '${dbName}' does not exist and 'Create if not exists' is disabled.`);
          }
        } catch (adminErr) {
          throw new Error(`Database '${dbName}' has no collections and cluster-wide database listing is restricted. Please check the name or enable 'Create if not exists'.`);
        }
      }
    } catch (err: any) {
      if (err.message.includes('Database') && err.message.includes('does not exist')) throw err;
      mongoClients.delete(cacheKey);
      await client.close();
      throw err;
    }
  }

  return db;
}
