import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildApp } from '../../app';
import fs from 'fs';
import { invalidateSettingsCache } from '../../services/secretManager';

vi.mock('fs');

const mockAhaSettings = {
  aha: {
    subdomain: 'test-subdomain',
    api_key: 'test-key'
  }
};

describe('Aha! Routes', () => {
  let app: any;

  beforeEach(async () => {
    delete process.env.ADMIN_SECRET;
    delete process.env.VITE_ADMIN_SECRET;
    app = await buildApp();
    vi.clearAllMocks();
    invalidateSettingsCache();
    app.getSettings = vi.fn().mockResolvedValue(mockAhaSettings);
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(JSON.stringify(mockAhaSettings));
  });

  it('POST /api/aha/test should return success when connected', async () => {
    // Mock global fetch
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true })
    });
    global.fetch = mockFetch;

    const response = await app.inject({
      method: 'POST',
      url: '/api/aha/test',
      payload: {
        aha: {
          subdomain: 'test-subdomain',
          api_key: 'test-key'
        }
      }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Connected!');
    expect(mockFetch).toHaveBeenCalledWith(
        'https://test-subdomain.aha.io/api/v1/features',
        expect.objectContaining({
            headers: expect.objectContaining({
                'Authorization': 'Bearer test-key'
            })
        })
    );
  });

  it('POST /api/aha/feature should return feature data', async () => {
    const mockFeature = {
      id: '123',
      reference_num: 'PROD-1',
      name: 'Test Feature',
      description: { body: '<p>Test Description</p>' },
      url: 'https://test.aha.io/features/PROD-1',
      requirements: [
        { reference_num: 'PROD-1-R1', name: 'Requirement 1' },
        { reference_num: 'PROD-1-R2', name: 'Requirement 2' }
      ],
      custom_fields: [
        { name: 'Product Value', value: 'High' }
      ]
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ feature: mockFeature })
    });
    global.fetch = mockFetch;

    const response = await app.inject({
      method: 'POST',
      url: '/api/aha/feature',
      payload: { reference_num: 'PROD-1' }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.feature.name).toBe('Test Feature');
    expect(mockFetch).toHaveBeenCalledWith(
        'https://test-subdomain.aha.io/api/v1/features/PROD-1',
        expect.any(Object)
    );
  });

  it('POST /api/aha/feature should unmask api_key from request body using stored settings', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ feature: { id: '1', reference_num: 'PROD-1', name: 'F' } })
    });
    global.fetch = mockFetch;

    const response = await app.inject({
      method: 'POST',
      url: '/api/aha/feature',
      payload: {
        reference_num: 'PROD-1',
        aha: {
          subdomain: 'test-subdomain',
          api_key: '********'
        }
      }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://test-subdomain.aha.io/api/v1/features/PROD-1',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-key'
        })
      })
    );
  });

  it('POST /api/aha/feature should return 404 when feature not found', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    });
    global.fetch = mockFetch;

    const response = await app.inject({
      method: 'POST',
      url: '/api/aha/feature',
      payload: { reference_num: 'NONEXISTENT' }
    });

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error).toContain('not found in Aha!');
  });

  it('POST /api/aha/features should paginate until features.length < per_page', async () => {
    const page1Features = Array.from({ length: 200 }, (_, i) => ({ id: `${i}`, reference_num: `PROD-${i}`, name: `Feature ${i}` }));
    const page2Features = Array.from({ length: 5 }, (_, i) => ({ id: `${200 + i}`, reference_num: `PROD-${200 + i}`, name: `Feature ${200 + i}` }));
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ features: page1Features }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ features: page2Features }) });
    global.fetch = mockFetch;

    const response = await app.inject({
      method: 'POST',
      url: '/api/aha/features',
      payload: { workspace: 'PROD' }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.features).toHaveLength(205);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenNthCalledWith(1,
      'https://test-subdomain.aha.io/api/v1/products/PROD/features?per_page=200&page=1&fields=id,reference_num,name,url,score,description,original_estimate,requirements,epic',
      expect.any(Object)
    );
    expect(mockFetch).toHaveBeenNthCalledWith(2,
      'https://test-subdomain.aha.io/api/v1/products/PROD/features?per_page=200&page=2&fields=id,reference_num,name,url,score,description,original_estimate,requirements,epic',
      expect.any(Object)
    );
  });

  it('POST /api/aha/features asks the list endpoint for every field the import reads', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ features: [] }) });
    global.fetch = mockFetch;

    const response = await app.inject({ method: 'POST', url: '/api/aha/features', payload: { workspace: 'PROD' } });

    expect(response.statusCode).toBe(200);
    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.searchParams.get('per_page')).toBe('200');
    expect(url.searchParams.get('fields')!.split(',').sort()).toEqual(
      ['description', 'epic', 'id', 'name', 'original_estimate', 'reference_num', 'requirements', 'score', 'url']
    );
  });

  it('POST /api/aha/epics lists a workspace\'s epics with full fields', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ epics: [{ id: 'e1', reference_num: 'DR-E-1' }] }) });
    global.fetch = mockFetch;

    const response = await app.inject({ method: 'POST', url: '/api/aha/epics', payload: { workspace: 'DR' } });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).epics).toEqual([{ id: 'e1', reference_num: 'DR-E-1' }]);
    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/v1/products/DR/epics');
    expect(url.searchParams.get('fields')!.split(',').sort()).toEqual(
      ['description', 'id', 'name', 'original_estimate', 'reference_num', 'score', 'url']
    );
  });

  it('POST /api/aha/epic fetches one epic by reference number', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ epic: { id: 'e1', reference_num: 'DR-E-1' } }) });
    global.fetch = mockFetch;

    const response = await app.inject({ method: 'POST', url: '/api/aha/epic', payload: { reference_num: 'DR-E-1' } });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).epic).toEqual({ id: 'e1', reference_num: 'DR-E-1' });
    expect(mockFetch.mock.calls[0][0]).toBe('https://test-subdomain.aha.io/api/v1/epics/DR-E-1');
  });

  it('POST /api/aha/features should return 404 error when workspace not found', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    });
    global.fetch = mockFetch;

    const response = await app.inject({
      method: 'POST',
      url: '/api/aha/features',
      payload: { workspace: 'NOPE' }
    });

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('NOPE');
  });
});
