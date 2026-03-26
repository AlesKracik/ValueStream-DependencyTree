import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gleanAuthStatus, gleanChat } from '../api';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('frontend api utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  describe('gleanAuthStatus', () => {
    it('should return true when authenticated', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: true })
      });

      const result = await gleanAuthStatus('https://test.glean.com');
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/glean/status?gleanUrl=https%3A%2F%2Ftest.glean.com'),
        expect.anything()
      );
    });
  });

  describe('gleanChat', () => {
    it('should send chat request to proxy', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 
          messages: [{ author: 'GLEAN_AI', fragments: [{ text: 'hello' }] }] 
        })
      });

      const result = await gleanChat('https://test.glean.com', 'hi');
      expect(result.messages![0].fragments![0].text).toBe('hello');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/glean/chat',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            gleanUrl: 'https://test.glean.com',
            messages: [{ author: 'USER', fragments: [{ text: 'hi' }] }],
            stream: false
          })
        })
      );
    });
  });
});
