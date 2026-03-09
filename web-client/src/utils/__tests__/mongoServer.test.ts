import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MongoClient } from 'mongodb';
import { getDb, clearMongoCache, getMongoClientCount, startMongoCleanup, stopMongoCleanup } from '../mongoServer';

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
      this.uri = uri;
      this.options = options;
      this.connect = mockConnect;
      this.db = mockDb;
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
    const config = { mongo_uri: 'mongodb://app-host', mongo_db: 'app-db' };
    
    const db1 = await getDb(config, 'app');
    expect(MongoClient).toHaveBeenCalledTimes(1);
    expect(getMongoClientCount()).toBe(1);

    const db2 = await getDb(config, 'app');
    expect(MongoClient).toHaveBeenCalledTimes(1); // Should be reused
    expect(db1).toBe(db2);
  });

  it('distinguishes between app and customer roles with different URIs', async () => {
    const config = { 
        mongo_uri: 'mongodb://app-host', 
        customer_mongo_uri: 'mongodb://customer-host' 
    };
    
    await getDb(config, 'app');
    expect(getMongoClientCount()).toBe(1);

    await getDb(config, 'customer');
    expect(getMongoClientCount()).toBe(2);
    expect(MongoClient).toHaveBeenCalledTimes(2);
  });

  it('uses proxy settings when configured', async () => {
    const config = { 
        mongo_uri: 'mongodb://host', 
        mongo_use_proxy: true,
        proxyHost: 'proxy-host',
        proxyPort: 1080
    };
    
    await getDb(config, 'app');
    expect(MongoClient).toHaveBeenCalledWith('mongodb://host', expect.objectContaining({
        proxyHost: 'proxy-host',
        proxyPort: 1080
    }));
  });

  it('enforces checkExists correctly', async () => {
    const config = { mongo_uri: 'mongodb://host', mongo_db: 'missing-db', mongo_create_if_not_exists: false };
    
    // Mock db.listCollections to return empty, and admin.listDatabases to not include missing-db
    const mockDbInstance = {
        listCollections: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
        admin: vi.fn().mockReturnValue({
            listDatabases: vi.fn().mockResolvedValue({ databases: [{ name: 'other' }] })
        })
    };
    
    vi.mocked(MongoClient).mockImplementationOnce(function() {
        this.connect = vi.fn().mockResolvedValue({});
        this.db = vi.fn().mockReturnValue(mockDbInstance);
        this.close = vi.fn().mockResolvedValue({});
    } as any);

    await expect(getDb(config, 'app', true)).rejects.toThrow(/has no collections and cluster-wide database listing is restricted/);
  });

  it('cleans up idle connections', async () => {
    const config = { mongo_uri: 'mongodb://host' };
    await getDb(config, 'app');
    expect(getMongoClientCount()).toBe(1);

    startMongoCleanup(100, 1000); // Check every 100ms, idle after 1s
    
    // Advance time by 2 seconds
    vi.advanceTimersByTime(2000);
    
    expect(getMongoClientCount()).toBe(0);
  });
});
