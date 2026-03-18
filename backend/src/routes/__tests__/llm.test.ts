import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { llmRoutes } from '../llm';
import fastify from 'fastify';
import fs from 'fs';
import { exec } from 'child_process';

vi.mock('child_process', () => ({
  exec: vi.fn()
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  }
}));

// Global fetch is available in Node 18+ and Vitest environment
const originalFetch = global.fetch;

describe('llmRoutes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = fastify();
    await app.register(llmRoutes);
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('calls glean API when glean provider is selected', async () => {
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(JSON.stringify({
      ai: { provider: 'glean', api_key: 'test-session-token' }
    }));
    
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        messages: [{ author: 'GLEAN_AI', fragments: [{ text: 'Glean API response' }] }]
      })
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/llm/generate',
      payload: {
        prompt: 'Hello AI',
        config: { ai: { provider: 'glean', api_key: 'test-session-token' } }
      }
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.body);
    expect(data.success).toBe(true);
    expect(data.text).toBe('Glean API response');
    
    expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('glean.com/rest/api/v1/chat'),
        expect.objectContaining({
            headers: expect.objectContaining({ 
                'Cookie': 'glean-session-store=test-session-token' 
            }),
            body: expect.stringContaining('"fragments":[{"text":"Hello AI"}]')
        })
    );
  });
});
