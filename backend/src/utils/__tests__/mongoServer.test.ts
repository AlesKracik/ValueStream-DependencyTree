import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MongoClient } from 'mongodb';
import { getDb, clearMongoCache, getMongoClientCount, startMongoCleanup, stopMongoCleanup } from '../mongoServer';

// Mock AWS credential providers
vi.mock('@aws-sdk/credential-providers', () => ({
  fromNodeProviderChain: vi.fn().mockReturnValue(() => Promise.resolve({})),
  fromSSO: vi.fn().mockReturnValue(() => Promise.resolve({}))
}));

// Mock MongoClient
vi.mock('mongodb', () => {
  const mockConnect = vi.fn().mockResolvedValue({});
  const mockDb = vi.fn().mockReturnValue({
    collection: vi.fn(),
    listCollections: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([{ name: 'test' }]) }),
    admin: vi.fn().mockReturnValue({
      listDatabases: vi.fn().mockResolvedValue({ databases: [{ name: 'valueStream' }] })
    })
  });
  const mockClose = vi.fn().mockResolvedValue({});

  return {
    MongoClient: vi.fn().mockImplementation(function(uri, options) {
      // @ts-ignore
      this.uri = uri;
      // @ts-ignore
      this.options = options;
      // @ts-ignore
      this.connect = mockConnect;
      // @ts-ignore
      this.db = mockDb;
      // @ts-ignore
      this.close = mockClose;
    }),
    ServerApiVersion: { v1: '1' }
  };
});

describe('mongoServer utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMongoCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopMongoCleanup();
    vi.useRealTimers();
  });

  it('creates and caches a connection for the app role', async () => {
    const config = { uri: 'mongodb://app-host', db: 'app-db' };
    
    const db1 = await getDb(config, 'app');
    expect(MongoClient).toHaveBeenCalledTimes(1);
    expect(getMongoClientCount()).toBe(1);

    const db2 = await getDb(config, 'app');
    expect(MongoClient).toHaveBeenCalledTimes(1); // Should be reused
    expect(db1).toBe(db2);
  });

  it('distinguishes between app and customer roles with different URIs', async () => {
    const configApp = { uri: 'mongodb://app-host' };
    const configCust = { uri: 'mongodb://customer-host' };
    
    await getDb(configApp, 'app');
    expect(getMongoClientCount()).toBe(1);

    await getDb(configCust, 'customer');
    expect(getMongoClientCount()).toBe(2);
    expect(MongoClient).toHaveBeenCalledTimes(2);
  });

  it('uses proxy settings when configured', async () => {
    const config = { 
        uri: 'mongodb://host', 
        use_proxy: true,
        proxyHost: 'proxy-host',
        proxyPort: 1080
    };
    
    await getDb(config, 'app');
    expect(MongoClient).toHaveBeenCalledWith('mongodb://host', expect.objectContaining({
        proxyHost: 'proxy-host',
        proxyPort: 1080
    }));
  });

  it('uses specific tunnel when tunnel_name is provided', async () => {
    const config = { 
        uri: 'mongodb://host', 
        use_proxy: true,
        proxyHost: 'default-proxy',
        proxyPort: 1080,
        tunnel_name: 'customer',
        tunnels: {
            customer: { host: 'customer-tunnel', port: 1081 },
            app: { host: 'app-tunnel', port: 1082 }
        }
    };
    
    await getDb(config, 'app');
    expect(MongoClient).toHaveBeenCalledWith('mongodb://host', expect.objectContaining({
        proxyHost: 'customer-tunnel',
        proxyPort: 1081
    }));
  });

  it('sets environment variables and NO_PROXY for MONGODB-AWS authentication', async () => {
    const config = { 
        uri: 'mongodb://host', 
        auth: {
            method: 'aws',
            aws_access_key: 'AK-test',
            aws_secret_key: 'SK-test',
            aws_session_token: 'ST-test'
        },
        use_proxy: true,
        proxyHost: 'proxy-host',
        proxyPort: 1080
    };
    
    // Clear relevant env vars
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_SESSION_TOKEN;
    delete process.env.NO_PROXY;

    await getDb(config as any, 'app');
    
    expect(process.env.AWS_ACCESS_KEY_ID).toBe('AK-test');
    expect(process.env.AWS_SECRET_ACCESS_KEY).toBe('SK-test');
    expect(process.env.AWS_SESSION_TOKEN).toBe('ST-test');
    expect(process.env.NO_PROXY).toContain('sts.amazonaws.com');
    expect(process.env.NO_PROXY).toContain('.amazonaws.com');
    
    // Call again to ensure no duplicates are added
    await getDb(config as any, 'app');
    const parts = process.env.NO_PROXY.split(',');
    const stsCount = parts.filter(p => p === 'sts.amazonaws.com').length;
    expect(stsCount).toBe(1);
    
    expect(MongoClient).toHaveBeenCalledWith('mongodb://host', expect.objectContaining({
        authMechanism: 'MONGODB-AWS',
        authSource: '$external',
        auth: { username: '', password: '' },
        authMechanismProperties: expect.objectContaining({
          AWS_CREDENTIAL_PROVIDER: expect.any(Function)
        })
    }));
  });

  it('uses fromSSO provider for SSO authentication type', async () => {
    const config = {
        uri: 'mongodb://host',
        auth: {
            method: 'aws',
            aws_auth_type: 'sso',
            aws_profile: 'my-sso-profile'
        }
    };

    await getDb(config as any, 'app');

    expect(MongoClient).toHaveBeenCalledWith('mongodb://host', expect.objectContaining({
        authMechanism: 'MONGODB-AWS',
        authSource: '$external',
        auth: { username: '', password: '' },
        authMechanismProperties: expect.objectContaining({
            AWS_CREDENTIAL_PROVIDER: expect.any(Function)
        })
    }));
  });

  it('throws for SSO auth without profile', async () => {
    const config = {
        uri: 'mongodb://host',
        auth: {
            method: 'aws',
            aws_auth_type: 'sso',
            aws_profile: ''
        }
    };

    await expect(getDb(config as any, 'app')).rejects.toThrow('AWS Profile is required for SSO authentication');
  });

  it('throws for static AWS auth without access key', async () => {
    const config = {
        uri: 'mongodb://host',
        auth: {
            method: 'aws',
            aws_auth_type: 'static',
            aws_access_key: '',
            aws_secret_key: ''
        }
    };

    await expect(getDb(config as any, 'app')).rejects.toThrow('AWS Access Key and Secret Key are required');
  });

  describe('isSafeUrl', () => {
    it('allows safe public and localhost URLs', async () => {
      const { isSafeUrl } = await import('../mongoServer');
      expect(await isSafeUrl('https://google.com')).toBe(true);
      expect(await isSafeUrl('mongodb://localhost:27017')).toBe(true);
      expect(await isSafeUrl('mongodb+srv://atlas-cluster.mongodb.net')).toBe(true);
      expect(await isSafeUrl('http://127.0.0.1')).toBe(true);
    });

    it('blocks cloud metadata services', async () => {
      const { isSafeUrl } = await import('../mongoServer');
      // 169.254.x.x is the AWS/GCP/Azure metadata service
      expect(await isSafeUrl('http://169.254.169.254')).toBe(false);
    });
  });

  it('cleans up idle connections', async () => {
    const config = { uri: 'mongodb://host' };
    await getDb(config, 'app');
    expect(getMongoClientCount()).toBe(1);

    startMongoCleanup(100, 1000); // Check every 100ms, idle after 1s
    
    // Advance time by 2 seconds
    vi.advanceTimersByTime(2000);
    
    expect(getMongoClientCount()).toBe(0);
  });
});
