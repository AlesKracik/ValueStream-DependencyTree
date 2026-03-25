import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildApp } from '../../app';
import fs from 'fs';

vi.mock('fs');

describe('Aha! Routes', () => {
  let app: any;

  beforeEach(async () => {
    delete process.env.ADMIN_SECRET;
    delete process.env.VITE_ADMIN_SECRET;
    app = await buildApp();
    vi.clearAllMocks();
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(JSON.stringify({
      aha: {
        subdomain: 'test-subdomain',
        api_key: 'test-key'
      }
    }));
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
});
