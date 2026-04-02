import { describe, it, expect, vi, beforeEach } from 'vitest';
import { refreshGleanToken, gleanChatRequest, saveGleanSettings } from '../gleanHelpers';
import fs from 'fs';

vi.mock('fs');
vi.mock('../../routes/settings', () => ({
  getSettingsPath: () => '/tmp/settings.json'
}));

const mockGetFullSettingsAsync = vi.fn();
const mockSaveFullSettingsAsync = vi.fn();
vi.mock('../../services/secretManager', () => ({
  getFullSettingsAsync: (...args: any[]) => mockGetFullSettingsAsync(...args),
  saveFullSettingsAsync: (...args: any[]) => mockSaveFullSettingsAsync(...args),
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
      // saveGleanSettings is called fire-and-forget inside refreshGleanToken
      mockGetFullSettingsAsync.mockResolvedValue({});
      mockSaveFullSettingsAsync.mockResolvedValue(undefined);

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

  describe('saveGleanSettings', () => {
    it('should merge glean state into existing settings and save', async () => {
      const existingSettings = {
        persistence: { mongo: { app: { uri: 'mongodb://localhost' } } },
        ai: { provider: 'glean' },
      };
      mockGetFullSettingsAsync.mockResolvedValueOnce(existingSettings);
      mockSaveFullSettingsAsync.mockResolvedValueOnce(undefined);

      const newGleanState = { tokens: { 'https://test.glean.com': { access_token: 'tok' } }, clients: {} };
      await saveGleanSettings(newGleanState);

      expect(mockSaveFullSettingsAsync).toHaveBeenCalledWith({
        persistence: { mongo: { app: { uri: 'mongodb://localhost' } } },
        ai: { provider: 'glean', glean_state: newGleanState },
      });
    });

    it('should throw and not save when reading settings fails', async () => {
      mockGetFullSettingsAsync.mockRejectedValueOnce(new Error('decrypt failed'));

      await expect(saveGleanSettings({ tokens: {} })).rejects.toThrow('decrypt failed');
      expect(mockSaveFullSettingsAsync).not.toHaveBeenCalled();
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
