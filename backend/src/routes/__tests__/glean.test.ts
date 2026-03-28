import { describe, it, expect, vi, beforeEach } from 'vitest';
import fastify, { FastifyInstance } from 'fastify';
import { gleanRoutes } from '../glean';
import * as gleanHelpers from '../../utils/gleanHelpers';

vi.mock('../../utils/gleanHelpers', () => ({
  getGleanSettings: vi.fn(),
  saveGleanSettings: vi.fn(),
  refreshGleanToken: vi.fn(),
  gleanChatRequest: vi.fn()
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('gleanRoutes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = fastify();
    await app.register(gleanRoutes);
    vi.clearAllMocks();
  });

  describe('POST /api/glean/auth/init', () => {
    it('should initialize auth with discovery and DCR', async () => {
      (gleanHelpers.getGleanSettings as any).mockReturnValue({ tokens: {}, clients: {} });

      // Mock discovery
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authorization_servers: ['https://auth.glean.com'] })
      });
      // Mock auth server discovery
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({
          authorization_endpoint: 'https://auth.glean.com/authorize',
          token_endpoint: 'https://auth.glean.com/token',
          registration_endpoint: 'https://auth.glean.com/register'
        })
      });
      // Mock DCR
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ client_id: 'test-id', client_secret: 'test-secret' })
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/glean/auth/init',
        payload: { gleanUrl: 'https://test.glean.com' }
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.authUrl).toContain('https://auth.glean.com/authorize');
      expect(data.authUrl).toContain('client_id=test-id');
      expect(gleanHelpers.saveGleanSettings).toHaveBeenCalled();
    });
  });

  describe('GET /api/glean/status', () => {
    it('should return authenticated true if token exists and is valid', async () => {
      (gleanHelpers.getGleanSettings as any).mockReturnValue({
        tokens: {
          'https://test.glean.com': {
            access_token: 'valid',
            expires_at: Date.now() + 100000
          }
        }
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/glean/status?gleanUrl=https://test.glean.com'
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ authenticated: true });
    });

    it('should return authenticated false if no token', async () => {
      (gleanHelpers.getGleanSettings as any).mockReturnValue({ tokens: {} });

      const response = await app.inject({
        method: 'GET',
        url: '/api/glean/status?gleanUrl=https://test.glean.com'
      });

      expect(JSON.parse(response.body)).toEqual({ authenticated: false });
    });
  });

  describe('POST /api/glean/chat', () => {
    it('should proxy chat request to Glean', async () => {
      (gleanHelpers.getGleanSettings as any).mockReturnValue({
        tokens: {
          'https://test.glean.com': {
            access_token: 'test-token',
            expires_at: Date.now() + 100000
          }
        }
      });

      (gleanHelpers.gleanChatRequest as any).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true })
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/glean/chat',
        payload: {
          gleanUrl: 'https://test.glean.com',
          messages: [{ author: 'USER', fragments: [{ text: 'hi' }] }]
        }
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ success: true });
      expect(gleanHelpers.gleanChatRequest).toHaveBeenCalledWith(
        'https://test.glean.com',
        'test-token',
        [{ author: 'USER', fragments: [{ text: 'hi' }] }],
        false
      );
    });
  });
});
