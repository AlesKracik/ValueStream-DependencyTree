import { describe, it, expect, vi, beforeEach } from 'vitest';
import { refreshGleanToken, gleanChatRequest } from '../gleanHelpers';
import fs from 'fs';

vi.mock('fs');
vi.mock('../../routes/settings', () => ({
  getSettingsPath: () => '/tmp/settings.json'
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('gleanHelpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('refreshGleanToken', () => {
    it('should refresh token successfully', async () => {
      const mockToken = {
        token_endpoint: 'https://auth.glean.com/token',
        refresh_token: 'old-refresh',
        client_id: 'cid',
        client_secret: 'csec'
      };
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          expires_in: 3600
        })
      });

      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockReturnValue(JSON.stringify({}));

      const gleanState = { tokens: {}, clients: {} };
      const result = await refreshGleanToken('https://test.glean.com', mockToken, gleanState);

      expect(result.access_token).toBe('new-access');
      expect(result.refresh_token).toBe('new-refresh');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://auth.glean.com/token',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(URLSearchParams)
        })
      );
    });
  });

  describe('gleanChatRequest', () => {
    it('should call chat API with correct headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      const response = await gleanChatRequest(
        'https://test.glean.com',
        'test-token',
        [{ author: 'USER', fragments: [{ text: 'hi' }] }],
        false
      );

      expect(response.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.glean.com/rest/api/v1/chat',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
            'X-Glean-Auth-Type': 'OAUTH'
          })
        })
      );
    });
  });
});
