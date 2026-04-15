import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { maskSettings, unmaskSettings, calculateQuarter, extractSecrets, stripSecrets, mergeSecrets, splitDotPath, getIntegrationConfig, ensureNotDirectory, ensureNotDirectoryAsync } from '../configHelpers';
import { partitionSettings, resolveScope, SETTINGS_SCOPE } from '@valuestream/shared-types';

describe('configHelpers', () => {
  describe('maskSettings', () => {
    it('should mask sensitive fields', () => {
      const settings = {
        api_token: 'secret123',
        uri: 'mongodb://user:pass@host',
        general: {
          name: 'My App',
          nested: {
            aws_access_key: 'AKIA123'
          }
        }
      };

      const masked = maskSettings(settings);

      expect(masked.api_token).toBe('********');
      expect(masked.uri).toBe('********');
      expect(masked.general.name).toBe('My App');
      expect(masked.general.nested.aws_access_key).toBe('********');
    });

    it('should handle null or undefined', () => {
      expect(maskSettings(null)).toBeNull();
      expect(maskSettings(undefined)).toBeUndefined();
    });

    it('should mask arrays if needed', () => {
      const settings = [{ api_token: 'secret' }, { other: 'value' }];
      const masked = maskSettings(settings);
      expect(masked[0].api_token).toBe('********');
      expect(masked[1].other).toBe('value');
    });
  });

  describe('unmaskSettings', () => {
    it('should restore sensitive fields from existing settings if masked', () => {
      const existing = {
        api_token: 'secret123',
        uri: 'mongodb://user:pass@host',
        general: {
          name: 'My App',
          nested: {
            aws_access_key: 'AKIA123'
          }
        }
      };

      const newData = {
        api_token: '********',
        uri: 'mongodb://newuser:newpass@newhost', // Changed value
        general: {
          name: 'New App Name',
          nested: {
            aws_access_key: '********'
          }
        }
      };

      const unmasked = unmaskSettings(newData, existing);

      // Restored from existing
      expect(unmasked.api_token).toBe('secret123');
      expect(unmasked.general.nested.aws_access_key).toBe('AKIA123');
      
      // Kept new value
      expect(unmasked.uri).toBe('mongodb://newuser:newpass@newhost');
      expect(unmasked.general.name).toBe('New App Name');
    });
  });

  describe('splitDotPath', () => {
    it('should split simple dot paths', () => {
      expect(splitDotPath('a.b.c')).toEqual(['a', 'b', 'c']);
    });

    it('should handle escaped dots within keys', () => {
      expect(splitDotPath('a.https://purestorage-be\\.glean\\.com.access_token'))
        .toEqual(['a', 'https://purestorage-be.glean.com', 'access_token']);
    });

    it('should handle escaped backslashes', () => {
      expect(splitDotPath('a.b\\\\c.d')).toEqual(['a', 'b\\c', 'd']);
    });

    it('should handle single key with no dots', () => {
      expect(splitDotPath('key')).toEqual(['key']);
    });
  });

  describe('extractSecrets', () => {
    it('should extract all sensitive fields as flat dot-path map', () => {
      const settings = {
        general: { theme: 'dark' },
        jira: { base_url: 'https://jira.com', api_token: 'secret-token' },
        persistence: {
          mongo: {
            app: { uri: 'mongodb://secret', db: 'mydb', auth: { aws_access_key: 'AKIA123' } }
          }
        }
      };

      const secrets = extractSecrets(settings);
      expect(secrets).toEqual({
        'jira.api_token': 'secret-token',
        'persistence.mongo.app.uri': 'mongodb://secret',
        'persistence.mongo.app.auth.aws_access_key': 'AKIA123'
      });
    });

    it('should skip masked values (********)', () => {
      const settings = { jira: { api_token: '********' } };
      expect(extractSecrets(settings)).toEqual({});
    });

    it('should skip empty strings', () => {
      const settings = { jira: { api_token: '' } };
      expect(extractSecrets(settings)).toEqual({});
    });

    it('should handle null/undefined input', () => {
      expect(extractSecrets(null)).toEqual({});
      expect(extractSecrets(undefined)).toEqual({});
    });

    it('should escape dots in keys (e.g., URLs used as keys)', () => {
      const settings = {
        glean_state: {
          tokens: {
            'https://purestorage-be.glean.com': {
              access_token: 'abc',
              refresh_token: 'xyz',
              expires_at: 1774463546015,
              client_id: 'zzz',
              token_endpoint: 'https://purestorage-be.glean.com/oauth/token'
            }
          }
        }
      };

      const secrets = extractSecrets(settings);
      // Keys with dots should be escaped in the dot-path
      expect(secrets['glean_state.tokens.https://purestorage-be\\.glean\\.com.access_token']).toBe('abc');
      expect(secrets['glean_state.tokens.https://purestorage-be\\.glean\\.com.refresh_token']).toBe('xyz');
    });
  });

  describe('stripSecrets', () => {
    it('should remove sensitive field values from nested object', () => {
      const settings = {
        general: { theme: 'dark' },
        jira: { base_url: 'https://jira.com', api_token: 'secret' },
        persistence: { mongo: { app: { uri: 'mongodb://secret', db: 'mydb' } } }
      };

      const stripped = stripSecrets(settings);
      expect(stripped.general.theme).toBe('dark');
      expect(stripped.jira.base_url).toBe('https://jira.com');
      expect(stripped.jira.api_token).toBeUndefined();
      expect(stripped.persistence.mongo.app.uri).toBeUndefined();
      expect(stripped.persistence.mongo.app.db).toBe('mydb');
    });

    it('should not mutate original object', () => {
      const settings = { jira: { api_token: 'secret' } };
      stripSecrets(settings);
      expect(settings.jira.api_token).toBe('secret');
    });
  });

  describe('mergeSecrets', () => {
    it('should inject flat secrets into correct nested positions', () => {
      const config = { general: { theme: 'dark' }, jira: { base_url: 'https://jira.com' } };
      const secrets = {
        'jira.api_token': 'secret-token',
        'persistence.mongo.app.uri': 'mongodb://secret'
      };

      const merged = mergeSecrets(config, secrets);
      expect(merged.jira.api_token).toBe('secret-token');
      expect(merged.jira.base_url).toBe('https://jira.com');
      expect(merged.persistence.mongo.app.uri).toBe('mongodb://secret');
      expect(merged.general.theme).toBe('dark');
    });

    it('should not mutate original config', () => {
      const config = { jira: { base_url: 'x' } };
      mergeSecrets(config, { 'jira.api_token': 'y' });
      expect((config.jira as any).api_token).toBeUndefined();
    });

    it('should handle empty secrets', () => {
      const config = { general: { theme: 'dark' } };
      const merged = mergeSecrets(config, {});
      expect(merged).toEqual(config);
    });

    it('should correctly reconstruct keys containing dots (URL keys)', () => {
      const config = {
        glean_state: {
          tokens: {
            'https://purestorage-be.glean.com': {
              expires_at: 1774463546015,
              client_id: 'zzz',
              token_endpoint: 'https://purestorage-be.glean.com/oauth/token'
            }
          }
        }
      };
      const secrets = {
        'glean_state.tokens.https://purestorage-be\\.glean\\.com.access_token': 'abc',
        'glean_state.tokens.https://purestorage-be\\.glean\\.com.refresh_token': 'xyz'
      };

      const merged = mergeSecrets(config, secrets);
      const tokenEntry = merged.glean_state.tokens['https://purestorage-be.glean.com'];
      expect(tokenEntry.access_token).toBe('abc');
      expect(tokenEntry.refresh_token).toBe('xyz');
      expect(tokenEntry.expires_at).toBe(1774463546015);
      expect(tokenEntry.client_id).toBe('zzz');
    });

    it('should round-trip extract+strip+merge with dotted keys', () => {
      const original = {
        general: { theme: 'dark' },
        glean_state: {
          tokens: {
            'https://purestorage-be.glean.com': {
              access_token: 'abc',
              refresh_token: 'xyz',
              expires_at: 1774463546015
            }
          }
        }
      };

      const secrets = extractSecrets(original);
      const stripped = stripSecrets(original);
      const restored = mergeSecrets(stripped, secrets);

      expect(restored).toEqual(original);
    });
  });

  describe('getIntegrationConfig', () => {
    const mockFastify = (settings: any) => ({
      getSettings: vi.fn().mockResolvedValue(settings),
    }) as any;

    it('should resolve config by unmasking rawConfig against stored settings', async () => {
      const fastify = mockFastify({ jira: { base_url: 'https://jira.com', api_token: 'real-token' } });
      const rawConfig = { jira: { base_url: 'https://jira.com', api_token: '********' } };

      const { full } = await getIntegrationConfig(fastify, rawConfig);

      expect(full.jira.api_token).toBe('real-token');
      expect(full.jira.base_url).toBe('https://jira.com');
    });

    it('should extract a named section', async () => {
      const fastify = mockFastify({ jira: { base_url: 'https://jira.com', api_token: 'token' } });
      const rawConfig = { jira: { base_url: 'https://jira.com', api_token: 'token' } };

      const { section } = await getIntegrationConfig(fastify, rawConfig, 'jira');

      expect(section.base_url).toBe('https://jira.com');
      expect(section.api_token).toBe('token');
    });

    it('should return empty object when section does not exist', async () => {
      const fastify = mockFastify({});
      const { section } = await getIntegrationConfig(fastify, {}, 'jira');

      expect(section).toEqual({});
    });

    it('should validate required fields and throw on missing', async () => {
      const fastify = mockFastify({});
      const rawConfig = { jira: {} };

      await expect(
        getIntegrationConfig(fastify, rawConfig, 'jira', [['base_url', 'Jira Base URL']])
      ).rejects.toThrow('Jira Base URL is not configured in settings.');
    });

    it('should validate multiple required fields in order', async () => {
      const fastify = mockFastify({});
      const rawConfig = { aha: {} };

      await expect(
        getIntegrationConfig(fastify, rawConfig, 'aha', [['subdomain', 'Aha! Subdomain'], ['api_key', 'Aha! API Key']])
      ).rejects.toThrow('Aha! Subdomain is not configured in settings.');
    });

    it('should pass validation when required fields are present', async () => {
      const fastify = mockFastify({ aha: { subdomain: 'test', api_key: 'key123' } });
      const rawConfig = { aha: { subdomain: 'test', api_key: 'key123' } };

      const { section } = await getIntegrationConfig(
        fastify, rawConfig, 'aha', [['subdomain', 'Aha! Subdomain'], ['api_key', 'Aha! API Key']]
      );

      expect(section.subdomain).toBe('test');
      expect(section.api_key).toBe('key123');
    });

    it('should return full config when no section is specified', async () => {
      const fastify = mockFastify({ existing: true });
      const rawConfig = { role: 'app', persistence: { mongo: { app: { uri: 'mongodb://host' } } } };

      const { full, section } = await getIntegrationConfig(fastify, rawConfig);

      expect(full.role).toBe('app');
      expect(full.persistence.mongo.app.uri).toBe('mongodb://host');
      // When no section, section === full config
      expect(section).toEqual(full);
    });
  });

  describe('resolveScope', () => {
    it('should return exact match scope', () => {
      expect(resolveScope('general')).toBe('server');
      expect(resolveScope('general.theme')).toBe('client');
    });

    it('should walk up to parent when no exact match', () => {
      // persistence.mongo.app.uri has no explicit entry, inherits from 'persistence'
      expect(resolveScope('persistence.mongo.app.uri')).toBe('server');
    });

    it('should return server as default for unknown paths', () => {
      expect(resolveScope('unknown.path')).toBe('server');
    });

    it('should respect a leaf override differing from parent', () => {
      // general.theme is 'client' while parent 'general' is 'server'
      expect(resolveScope('general.theme')).toBe('client');
      expect(resolveScope('general.fiscal_year_start_month')).toBe('server');
    });
  });

  describe('partitionSettings', () => {
    it('should split theme to client and rest to server', () => {
      const settings = {
        general: { fiscal_year_start_month: 1, sprint_duration_days: 14, theme: 'dark' as const },
        jira: { base_url: 'https://jira.com', api_version: '3' as const },
      };

      const { server, client } = partitionSettings(settings);

      expect(server).toEqual({
        general: { fiscal_year_start_month: 1, sprint_duration_days: 14 },
        jira: { base_url: 'https://jira.com', api_version: '3' },
      });
      expect(client).toEqual({ general: { theme: 'dark' } });
    });

    it('should partition an entire top-level section to client', () => {
      const original = SETTINGS_SCOPE['general'];
      SETTINGS_SCOPE['general'] = 'client';
      // Remove leaf overrides so they inherit from parent
      const savedLeaves: Record<string, string> = {};
      for (const key of Object.keys(SETTINGS_SCOPE)) {
        if (key.startsWith('general.')) {
          savedLeaves[key] = SETTINGS_SCOPE[key];
          delete SETTINGS_SCOPE[key];
        }
      }

      try {
        const settings = {
          general: { fiscal_year_start_month: 4, sprint_duration_days: 14, theme: 'dark' as const },
          jira: { base_url: 'https://jira.com', api_version: '3' as const },
        };

        const { server, client } = partitionSettings(settings);

        expect(server).toEqual({ jira: settings.jira });
        expect(client).toEqual({ general: settings.general });
      } finally {
        SETTINGS_SCOPE['general'] = original;
        Object.assign(SETTINGS_SCOPE, savedLeaves);
      }
    });

    it('should split fields within a single section when scopes differ', () => {
      // general.theme is already 'client' while the rest of general is 'server'
      const settings = {
        general: { fiscal_year_start_month: 4, sprint_duration_days: 14, theme: 'dark' as const },
      };

      const { server, client } = partitionSettings(settings);

      expect(server).toEqual({ general: { fiscal_year_start_month: 4, sprint_duration_days: 14 } });
      expect(client).toEqual({ general: { theme: 'dark' } });
    });

    it('should handle empty input', () => {
      const { server, client } = partitionSettings({});
      expect(server).toEqual({});
      expect(client).toEqual({});
    });
  });

  describe('EISDIR handling (PVC subPath mount)', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eisdir-test-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    describe('ensureNotDirectory', () => {
      it('should remove a directory so a file can be written', () => {
        const filePath = path.join(tmpDir, 'settings.json');
        fs.mkdirSync(filePath);
        expect(fs.statSync(filePath).isDirectory()).toBe(true);

        ensureNotDirectory(filePath);

        expect(fs.existsSync(filePath)).toBe(false);
        // Now a file can be written
        fs.writeFileSync(filePath, '{}');
        expect(fs.statSync(filePath).isFile()).toBe(true);
      });

      it('should be a no-op when path is already a file', () => {
        const filePath = path.join(tmpDir, 'settings.json');
        fs.writeFileSync(filePath, '{"key":"value"}');

        ensureNotDirectory(filePath);

        expect(fs.readFileSync(filePath, 'utf-8')).toBe('{"key":"value"}');
      });

      it('should be a no-op when path does not exist', () => {
        const filePath = path.join(tmpDir, 'nonexistent.json');
        ensureNotDirectory(filePath);
        expect(fs.existsSync(filePath)).toBe(false);
      });
    });

    describe('ensureNotDirectoryAsync', () => {
      it('should remove a directory so a file can be written', async () => {
        const filePath = path.join(tmpDir, 'settings.json');
        fs.mkdirSync(filePath);

        await ensureNotDirectoryAsync(filePath);

        expect(fs.existsSync(filePath)).toBe(false);
      });

      it('should be a no-op when path does not exist', async () => {
        const filePath = path.join(tmpDir, 'nonexistent.json');
        await ensureNotDirectoryAsync(filePath);
        expect(fs.existsSync(filePath)).toBe(false);
      });
    });
  });

  describe('calculateQuarter', () => {
    it('should calculate FY quarters correctly based on start month', () => {
      // If FY starts in April (4)
      expect(calculateQuarter('2026-03-15', 4)).toBe('FY26Q4'); // Mar 2026 is Q4 of FY26
      expect(calculateQuarter('2026-04-15', 4)).toBe('FY27Q1'); // Apr 2026 is Q1 of FY27
      expect(calculateQuarter('2026-07-15', 4)).toBe('FY27Q2'); // Jul 2026 is Q2 of FY27
      
      // If FY starts in January (1)
      expect(calculateQuarter('2026-01-15', 1)).toBe('FY27Q1');
      expect(calculateQuarter('2026-12-15', 1)).toBe('FY27Q4');
    });
  });
});
