import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../app';
import fs from 'fs';
import path from 'path';

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
  });

  it('should successfully save and mask new settings', async () => {
    const originalExistsSync = fs.existsSync;
    vi.spyOn(fs, 'existsSync').mockImplementation((p: any) => {
      if (typeof p === 'string' && p.endsWith('settings.json')) return true;
      if (typeof p === 'string' && p.endsWith('backend')) return true;
      return originalExistsSync(p);
    });

    const originalReadFileSync = fs.readFileSync;
    vi.spyOn(fs, 'readFileSync').mockImplementation((p: any, options: any) => {
      if (typeof p === 'string' && p.endsWith('settings.json')) {
        return JSON.stringify({ jira: { api_token: 'old-token' } });
      }
      return originalReadFileSync(p, options);
    });
    
    const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

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

    expect(writeFileSyncSpy).toHaveBeenCalled();
    const writeCall = writeFileSyncSpy.mock.calls[0];
    
    // Assert it wrote to a settings.json file
    expect(writeCall[0] as string).toMatch(/settings\.json$/);
    
    const writtenData = JSON.parse(writeCall[1] as string);
    expect(writtenData.jira.base_url).toBe('https://newjira.com');
    expect(writtenData.jira.api_token).toBe('old-token'); // Unmasked correctly!
  });
});
