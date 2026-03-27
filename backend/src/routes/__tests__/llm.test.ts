import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { llmRoutes } from '../llm';
import fastify from 'fastify';

// Mock everything from gleanHelpers
vi.mock('../../utils/gleanHelpers', () => ({
  getGleanSettings: vi.fn(),
  refreshGleanToken: vi.fn(),
  gleanChatRequest: vi.fn()
}));

import { getGleanSettings, gleanChatRequest } from '../../utils/gleanHelpers';

vi.mock('child_process', () => ({
  exec: vi.fn()
}));

describe('llmRoutes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = fastify();
    // Decorate with getSettings since llmRoutes now uses fastify.getSettings()
    app.decorate('getSettings', vi.fn().mockResolvedValue({
      ai: { provider: 'glean', glean_url: 'https://test.glean.com' }
    }));
    await app.register(llmRoutes);
    vi.clearAllMocks();
  });

  it('calls glean API when glean provider is selected', async () => {
    app.getSettings = vi.fn().mockResolvedValue({
      ai: { provider: 'glean', glean_url: 'https://test.glean.com' }
    });

    (getGleanSettings as any).mockReturnValue({
      tokens: {
        'https://test.glean.com': {
          access_token: 'test-token',
          expires_at: Date.now() + 3600000
        }
      },
      clients: {}
    });

    (gleanChatRequest as any).mockResolvedValue({
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
        config: { ai: { provider: 'glean', glean_url: 'https://test.glean.com' } }
      }
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.body);
    expect(data.success).toBe(true);
    expect(data.text).toBe('Glean API response');
    
    expect(gleanChatRequest).toHaveBeenCalledWith(
        'https://test.glean.com',
        'test-token',
        expect.arrayContaining([
            expect.objectContaining({ fragments: [{ text: 'Hello AI' }] })
        ])
    );
  });
});
