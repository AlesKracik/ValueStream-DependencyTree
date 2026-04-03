import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  hashPassword, verifyPassword, signToken, verifyToken,
  getClientSettings, saveClientSettings
} from '../userService';

describe('userService', () => {
  describe('password hashing', () => {
    it('should hash and verify a password', async () => {
      const hash = await hashPassword('test-password');
      expect(hash).not.toBe('test-password');
      expect(await verifyPassword('test-password', hash)).toBe(true);
      expect(await verifyPassword('wrong-password', hash)).toBe(false);
    });
  });

  describe('JWT', () => {
    beforeEach(() => {
      process.env.ADMIN_SECRET = 'test-jwt-secret';
    });

    it('should sign and verify a token', () => {
      const payload = { userId: 'u1', username: 'alice', role: 'admin' as const };
      const token = signToken(payload, 1);
      const verified = verifyToken(token);
      expect(verified).not.toBeNull();
      expect(verified!.username).toBe('alice');
      expect(verified!.role).toBe('admin');
    });

    it('should return null for invalid token', () => {
      expect(verifyToken('garbage')).toBeNull();
    });
  });

  describe('client settings encryption', () => {
    let mockCollection: any;
    let mockDb: any;
    let storedDoc: Record<string, any>;

    beforeEach(() => {
      process.env.ADMIN_SECRET = 'test-encryption-key';
      storedDoc = {};
      mockCollection = {
        findOne: vi.fn().mockImplementation(() => Promise.resolve(storedDoc)),
        updateOne: vi.fn().mockImplementation((_filter: any, update: any) => {
          Object.assign(storedDoc, update.$set);
          return Promise.resolve({ matchedCount: 1 });
        }),
      };
      mockDb = {
        collection: vi.fn().mockReturnValue(mockCollection),
      };
    });

    it('should round-trip client settings without sensitive fields', async () => {
      const settings = { general: { theme: 'dark', fiscal_year_start_month: 4 } };

      await saveClientSettings(mockDb, 'user-1', settings);
      const loaded = await getClientSettings(mockDb, 'user-1');

      expect(loaded).toEqual(settings);
      // No secrets — client_settings_secrets should be null
      expect(storedDoc.client_settings_secrets).toBeNull();
    });

    it('should encrypt sensitive fields and store them separately', async () => {
      const settings = {
        general: { theme: 'dark' },
        jira: { base_url: 'https://jira.com', api_token: 'secret-token-123' }
      };

      await saveClientSettings(mockDb, 'user-1', settings);

      // api_token is a sensitive field — should be stripped from client_settings
      expect(storedDoc.client_settings.jira.api_token).toBeUndefined();
      expect(storedDoc.client_settings.jira.base_url).toBe('https://jira.com');
      expect(storedDoc.client_settings.general.theme).toBe('dark');

      // Encrypted blob should exist
      expect(storedDoc.client_settings_secrets).toBeDefined();
      expect(typeof storedDoc.client_settings_secrets).toBe('string');

      // Encrypted blob should not contain the plaintext secret
      expect(storedDoc.client_settings_secrets).not.toContain('secret-token-123');
    });

    it('should decrypt and merge sensitive fields on read', async () => {
      const settings = {
        general: { theme: 'dark' },
        jira: { base_url: 'https://jira.com', api_token: 'secret-token-123' }
      };

      await saveClientSettings(mockDb, 'user-1', settings);
      const loaded = await getClientSettings(mockDb, 'user-1');

      expect(loaded).toEqual(settings);
    });

    it('should handle missing encrypted secrets gracefully', async () => {
      storedDoc = { client_settings: { general: { theme: 'dark' } } };

      const loaded = await getClientSettings(mockDb, 'user-1');
      expect(loaded).toEqual({ general: { theme: 'dark' } });
    });

    it('should handle corrupted encrypted secrets gracefully', async () => {
      storedDoc = {
        client_settings: { general: { theme: 'dark' } },
        client_settings_secrets: 'not-valid-json',
      };

      const loaded = await getClientSettings(mockDb, 'user-1');
      expect(loaded).toEqual({ general: { theme: 'dark' } });
    });

    it('should handle different ADMIN_SECRET on decrypt gracefully', async () => {
      const settings = {
        jira: { api_token: 'secret-value' }
      };

      await saveClientSettings(mockDb, 'user-1', settings);

      // Change the secret — simulates key rotation
      process.env.ADMIN_SECRET = 'different-key';
      // Force re-derivation by clearing any cached key (signToken uses a separate cache)

      const loaded = await getClientSettings(mockDb, 'user-1');
      // Should return without the secret (decryption fails gracefully)
      expect(loaded).toEqual({ jira: {} });
    });

    it('should return true when save matches a user document', async () => {
      // Simulate existing user doc
      storedDoc = { id: 'user-1', username: 'alice', client_settings: {} };
      mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });

      const persisted = await saveClientSettings(mockDb, 'user-1', { general: { theme: 'dark' } });
      expect(persisted).toBe(true);
    });

    it('should return false when save matches no user document', async () => {
      // No user doc exists for this id
      mockCollection.updateOne.mockResolvedValue({ matchedCount: 0 });

      const persisted = await saveClientSettings(mockDb, 'nonexistent-user', { general: { theme: 'dark' } });
      expect(persisted).toBe(false);
    });
  });
});
