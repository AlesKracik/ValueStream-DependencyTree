import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../app';
import { invalidateSettingsCache } from '../../services/secretManager';

describe('Settings Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    delete process.env.ADMIN_SECRET;
    delete process.env.VITE_ADMIN_SECRET;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    invalidateSettingsCache();
  });

  it('should successfully save and mask new settings', async () => {
    app.getSettings = vi.fn().mockResolvedValue({ jira: { api_token: 'old-token' } });
    const saveSpy = vi.fn();
    app.saveSettings = saveSpy;

    const response = await app.inject({
      method: 'POST',
      url: '/api/settings',
      payload: {
        jira: {
          base_url: 'https://newjira.com',
          api_token: '********' // Simulate frontend sending masked token
        }
      }
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.payload);
    expect(json.success).toBe(true);

    expect(saveSpy).toHaveBeenCalled();
    const savedData = saveSpy.mock.calls[0][0];
    expect(savedData.jira.base_url).toBe('https://newjira.com');
    expect(savedData.jira.api_token).toBe('old-token'); // Unmasked correctly!
  });
});
