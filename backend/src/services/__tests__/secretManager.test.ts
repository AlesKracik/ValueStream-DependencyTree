import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  EncryptedFileProvider,
  EnvProvider,
  NoOpProvider,
  getSecretManager,
  resetSecretManager,
  setSecretManager,
  migrateSecretsFromSettingsFile
} from '../secretManager';
import * as configHelpers from '../../utils/configHelpers';

describe('EncryptedFileProvider', () => {
  let tmpDir: string;
  let encPath: string;
  const masterKey = 'test-admin-secret-123';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'secretmgr-test-'));
    encPath = path.join(tmpDir, 'settings.secrets.enc');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return empty when no file exists', () => {
    const provider = new EncryptedFileProvider(encPath, masterKey);
    expect(provider.getAll()).toEqual({});
    expect(provider.get('any.key')).toBeUndefined();
    expect(provider.hasSecrets()).toBe(false);
  });

  it('should encrypt and decrypt round-trip correctly', () => {
    const provider = new EncryptedFileProvider(encPath, masterKey);
    const secrets = {
      'persistence.mongo.app.uri': 'mongodb://user:pass@host/db',
      'jira.api_token': 'jira-pat-123',
      'ai.api_key': 'sk-abc123'
    };

    provider.setAll(secrets);

    // Verify file was created
    expect(fs.existsSync(encPath)).toBe(true);

    // Verify file content is encrypted (not plain text)
    const raw = fs.readFileSync(encPath, 'utf-8');
    expect(raw).not.toContain('mongodb://');
    expect(raw).not.toContain('jira-pat-123');
    const parsed = JSON.parse(raw);
    expect(parsed.version).toBe(1);
    expect(parsed.salt).toBeDefined();
    expect(parsed.iv).toBeDefined();
    expect(parsed.tag).toBeDefined();
    expect(parsed.ciphertext).toBeDefined();

    // Read back with a new provider instance (no cache)
    const provider2 = new EncryptedFileProvider(encPath, masterKey);
    expect(provider2.getAll()).toEqual(secrets);
    expect(provider2.get('jira.api_token')).toBe('jira-pat-123');
    expect(provider2.hasSecrets()).toBe(true);
  });

  it('should fail to decrypt with wrong master key', () => {
    const provider = new EncryptedFileProvider(encPath, masterKey);
    provider.setAll({ 'test.key': 'value' });

    const wrongProvider = new EncryptedFileProvider(encPath, 'wrong-key');
    expect(() => wrongProvider.getAll()).toThrow(/Failed to decrypt/);
  });

  it('should handle set/get/delete individual keys', () => {
    const provider = new EncryptedFileProvider(encPath, masterKey);

    provider.set('key1', 'value1');
    provider.set('key2', 'value2');
    expect(provider.get('key1')).toBe('value1');
    expect(provider.get('key2')).toBe('value2');

    provider.delete('key1');
    expect(provider.get('key1')).toBeUndefined();
    expect(provider.get('key2')).toBe('value2');
  });

  it('should handle setAll replacing all secrets', () => {
    const provider = new EncryptedFileProvider(encPath, masterKey);

    provider.set('old.key', 'old-value');
    provider.setAll({ 'new.key': 'new-value' });

    expect(provider.get('old.key')).toBeUndefined();
    expect(provider.get('new.key')).toBe('new-value');
  });

  it('should throw on corrupt file', () => {
    fs.writeFileSync(encPath, '{"version":1,"salt":"bad","iv":"bad","tag":"bad","ciphertext":"bad"}');

    const provider = new EncryptedFileProvider(encPath, masterKey);
    expect(() => provider.getAll()).toThrow(/Failed to decrypt/);
  });

  it('should handle encPath being a directory (Docker bind mount edge case)', () => {
    // Docker creates a directory when the host file doesn't exist on bind mount
    fs.mkdirSync(encPath, { recursive: true });
    expect(fs.statSync(encPath).isDirectory()).toBe(true);

    const provider = new EncryptedFileProvider(encPath, masterKey);

    // readFile should treat a directory as "no file" and return empty
    expect(provider.getAll()).toEqual({});

    // writeFile should replace the directory with a proper file
    provider.set('key', 'value');
    expect(fs.statSync(encPath).isFile()).toBe(true);
    expect(provider.get('key')).toBe('value');

    // Verify a fresh provider can read it back
    const provider2 = new EncryptedFileProvider(encPath, masterKey);
    expect(provider2.get('key')).toBe('value');
  });

  it('should fall back to direct write when rename fails (Docker/macOS)', () => {
    const provider = new EncryptedFileProvider(encPath, masterKey);

    // Spy on fs to make renameSync fail (simulates Docker bind mount on macOS)
    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('EXDEV: cross-device link not permitted');
    });
    const writeFileSpy = vi.spyOn(fs, 'writeFileSync');
    const unlinkSpy = vi.spyOn(fs, 'unlinkSync');

    provider.set('key', 'value');

    // renameSync was called and failed
    expect(renameSpy).toHaveBeenCalled();
    // Fallback: writeFileSync should have been called for the actual file (not just .tmp)
    const writeCallPaths = writeFileSpy.mock.calls.map(c => c[0]);
    expect(writeCallPaths).toContain(encPath);
    // Cleanup: unlinkSync should have been called for the .tmp file
    expect(unlinkSpy).toHaveBeenCalledWith(encPath + '.tmp');

    // Verify data is readable
    renameSpy.mockRestore();
    writeFileSpy.mockRestore();
    unlinkSpy.mockRestore();

    const provider2 = new EncryptedFileProvider(encPath, masterKey);
    expect(provider2.get('key')).toBe('value');
  });

  it('should use cached data on subsequent reads', () => {
    const provider = new EncryptedFileProvider(encPath, masterKey);
    provider.setAll({ 'key': 'value' });

    // Read once to populate cache
    expect(provider.get('key')).toBe('value');

    // Delete the file — should still return cached data
    fs.unlinkSync(encPath);
    expect(provider.get('key')).toBe('value');

    // After invalidation, should return empty (file gone)
    provider.invalidateCache();
    expect(provider.get('key')).toBeUndefined();
  });
});

describe('EnvProvider', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore env
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('VSDT_SECRET_')) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  it('should read secrets from VSDT_SECRET_ env vars', () => {
    process.env.VSDT_SECRET_PERSISTENCE_MONGO_APP_URI = 'mongodb://test';
    process.env.VSDT_SECRET_JIRA_API_TOKEN = 'jira-token';

    const provider = new EnvProvider();
    expect(provider.get('persistence.mongo.app.uri')).toBe('mongodb://test');
    expect(provider.get('jira.api.token')).toBe('jira-token');
    expect(provider.hasSecrets()).toBe(true);
  });

  it('should return all secrets as dot-path map', () => {
    process.env.VSDT_SECRET_AI_API_KEY = 'sk-test';

    const provider = new EnvProvider();
    const all = provider.getAll();
    expect(all['ai.api.key']).toBe('sk-test');
  });

  it('should return undefined for missing keys', () => {
    const provider = new EnvProvider();
    expect(provider.get('nonexistent.key')).toBeUndefined();
  });

  it('set/delete/setAll should be no-ops', () => {
    const provider = new EnvProvider();
    // These should not throw
    provider.set('key', 'value');
    provider.setAll({ 'key': 'value' });
    provider.delete('key');
    expect(provider.get('key')).toBeUndefined();
  });
});

describe('NoOpProvider', () => {
  it('should return empty for all operations', () => {
    const provider = new NoOpProvider();
    expect(provider.get('any')).toBeUndefined();
    expect(provider.getAll()).toEqual({});
    expect(provider.hasSecrets()).toBe(false);
    // Should not throw
    provider.set('key', 'value');
    provider.setAll({});
    provider.delete('key');
  });
});

describe('getSecretManager (provider selection)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetSecretManager();
  });

  afterEach(() => {
    resetSecretManager();
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('VSDT_SECRET_')) {
        delete process.env[key];
      }
    }
    process.env.ADMIN_SECRET = originalEnv.ADMIN_SECRET;
  });

  it('should return EnvProvider when VSDT_SECRET_ env vars exist', () => {
    process.env.VSDT_SECRET_TEST_KEY = 'value';
    const sm = getSecretManager();
    expect(sm).toBeInstanceOf(EnvProvider);
  });

  it('should return EncryptedFileProvider when ADMIN_SECRET is set', () => {
    process.env.ADMIN_SECRET = 'test-secret';
    const sm = getSecretManager();
    expect(sm).toBeInstanceOf(EncryptedFileProvider);
  });

  it('should return NoOpProvider when neither env vars nor ADMIN_SECRET exist', () => {
    delete process.env.ADMIN_SECRET;
    const sm = getSecretManager();
    expect(sm).toBeInstanceOf(NoOpProvider);
  });

  it('should return singleton instance', () => {
    delete process.env.ADMIN_SECRET;
    const sm1 = getSecretManager();
    const sm2 = getSecretManager();
    expect(sm1).toBe(sm2);
  });
});

describe('migrateSecretsFromSettingsFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-test-'));
    resetSecretManager();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    resetSecretManager();
  });

  it('should migrate secrets from settings.json to encrypted storage', () => {
    const encPath = path.join(tmpDir, 'settings.secrets.enc');
    const provider = new EncryptedFileProvider(encPath, 'migrate-key');
    setSecretManager(provider);

    const settingsJsonPath = path.join(tmpDir, 'settings.json');
    const settingsWithSecrets = {
      general: { theme: 'dark' },
      jira: { base_url: 'https://jira.example.com', api_token: 'secret-token' },
      persistence: { mongo: { app: { uri: 'mongodb://secret-uri', db: 'mydb' } } }
    };
    fs.writeFileSync(settingsJsonPath, JSON.stringify(settingsWithSecrets, null, 2));

    // Override readSettingsFile and getSettingsPath for the test
    vi.spyOn(configHelpers, 'readSettingsFile').mockReturnValue(settingsWithSecrets);
    vi.spyOn(configHelpers, 'getSettingsPath').mockReturnValue(settingsJsonPath);

    const result = migrateSecretsFromSettingsFile();

    expect(result.migrated).toBe(2); // api_token + uri

    // Verify secrets are in SecretManager
    expect(provider.get('jira.api_token')).toBe('secret-token');
    expect(provider.get('persistence.mongo.app.uri')).toBe('mongodb://secret-uri');

    // Verify settings.json was stripped of secrets
    const stripped = JSON.parse(fs.readFileSync(settingsJsonPath, 'utf-8'));
    expect(stripped.jira.api_token).toBeUndefined();
    expect(stripped.persistence.mongo.app.uri).toBeUndefined();
    expect(stripped.general.theme).toBe('dark');
    expect(stripped.jira.base_url).toBe('https://jira.example.com');
    expect(stripped.persistence.mongo.app.db).toBe('mydb');

    vi.restoreAllMocks();
  });

  it('should be a no-op when settings.json has no secrets', () => {
    const provider = new NoOpProvider();
    setSecretManager(provider);

    vi.spyOn(configHelpers, 'readSettingsFile').mockReturnValue({
      general: { theme: 'dark' }
    });

    const result = migrateSecretsFromSettingsFile();
    expect(result.migrated).toBe(0);

    vi.restoreAllMocks();
  });

  it('should skip migration when NoOpProvider is active', () => {
    delete process.env.ADMIN_SECRET;
    // getSecretManager will return NoOpProvider

    vi.spyOn(configHelpers, 'readSettingsFile').mockReturnValue({
      jira: { api_token: 'secret' }
    });

    const result = migrateSecretsFromSettingsFile();
    expect(result.migrated).toBe(0);

    vi.restoreAllMocks();
  });
});
