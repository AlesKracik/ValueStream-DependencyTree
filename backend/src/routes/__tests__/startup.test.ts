import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../app';
import { invalidateSettingsCache } from '../../services/secretManager';

describe('Startup (No Settings File)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    // Ensure no environment variables interfere
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

  it('GET /api/settings should return success:true and empty settings when file is missing', async () => {
    app.getSettings = vi.fn().mockResolvedValue({});

    const response = await app.inject({
      method: 'GET',
      url: '/api/settings'
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.payload);
    expect(json.success).toBe(true);
    expect(json.settings).toEqual({});
  });

  it('GET /api/workspace should return default structure when file is missing', async () => {
    app.getSettings = vi.fn().mockResolvedValue({});

    const response = await app.inject({
      method: 'GET',
      url: '/api/workspace'
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.payload);

    expect(json.settings).toEqual({});
    expect(json.customers).toEqual([]);
    expect(json.workItems).toEqual([]);
    expect(json.teams).toEqual([]);
    expect(json.issues).toEqual([]);
    expect(json.sprints).toEqual([]);
    expect(json.valueStreams).toEqual([]);
    expect(json.metrics).toEqual({ maxScore: 1, maxRoi: 1 });
  });

  it('POST /api/settings should create the settings file when it is missing', async () => {
    app.getSettings = vi.fn().mockResolvedValue({});
    const saveSpy = vi.fn();
    app.saveSettings = saveSpy;

    const newSettings = {
        general: { fiscal_year_start_month: 3 }
    };

    const response = await app.inject({
      method: 'POST',
      url: '/api/settings',
      payload: newSettings
    });

    expect(response.statusCode).toBe(200);
    expect(saveSpy).toHaveBeenCalled();
    const savedData = saveSpy.mock.calls[0][0];
    expect(savedData.general.fiscal_year_start_month).toBe(3);
  });
});
