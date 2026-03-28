import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gleanAuthStatus, gleanChat, syncJiraIssue, syncAhaFeature, llmGenerate, gleanAuthLogin } from '../api';

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

  describe('syncJiraIssue (via apiPost)', () => {
    it('should return data on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { key: 'PROJ-1' } }),
        status: 200
      });

      const result = await syncJiraIssue('PROJ-1', { base_url: 'https://jira.test' });
      expect(result).toEqual({ key: 'PROJ-1' });
    });

    it('should throw on validation error', async () => {
      await expect(syncJiraIssue('TBD', {})).rejects.toThrow('valid Jira Key');
      await expect(syncJiraIssue('', {})).rejects.toThrow('valid Jira Key');
    });

    it('should throw on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Not found' }),
        status: 404
      });

      await expect(syncJiraIssue('PROJ-1', {})).rejects.toThrow('Not found');
    });
  });

  describe('syncAhaFeature (via apiPost)', () => {
    it('should return feature on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, feature: { name: 'Feature A' } }),
        status: 200
      });

      const result = await syncAhaFeature('FEAT-1', { subdomain: 'test' });
      expect(result).toEqual({ name: 'Feature A' });
    });

    it('should throw on empty reference', async () => {
      await expect(syncAhaFeature('', {})).rejects.toThrow('valid Aha!');
    });
  });

  describe('llmGenerate (via apiPost)', () => {
    it('should return text on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, text: 'Generated response' }),
        status: 200
      });

      const result = await llmGenerate('hello', {});
      expect(result).toBe('Generated response');
    });

    it('should throw on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: false }),
        status: 200
      });

      await expect(llmGenerate('hello', {})).rejects.toThrow('Failed to generate LLM response');
    });
  });

  describe('gleanAuthLogin (via apiPost with custom successCheck)', () => {
    it('should redirect on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authUrl: 'https://glean.test/auth' }),
        status: 200
      });

      // window.location.href assignment triggers navigation in jsdom — just check no throw
      await expect(gleanAuthLogin('https://glean.test')).resolves.toBeUndefined();
    });

    it('should throw when authUrl is missing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
        status: 200
      });

      await expect(gleanAuthLogin('https://glean.test')).rejects.toThrow('Failed to initialize Glean auth');
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
