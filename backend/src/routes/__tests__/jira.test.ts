import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildApp } from '../../app';
import fs from 'fs';
import { invalidateSettingsCache } from '../../services/secretManager';

vi.mock('fs');

const mockJiraSettings = {
  jira: {
    base_url: 'https://example.atlassian.net',
    api_token: 'test-token',
    api_version: '3'
  }
};

describe('Jira Routes', () => {
  let app: any;

  beforeEach(async () => {
    delete process.env.ADMIN_SECRET;
    delete process.env.VITE_ADMIN_SECRET;
    app = await buildApp();
    vi.clearAllMocks();
    invalidateSettingsCache();
    app.getSettings = vi.fn().mockResolvedValue(mockJiraSettings);
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(JSON.stringify(mockJiraSettings));
  });

  it('POST /api/jira/search forwards JQL verbatim and returns issues on success', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ issues: [{ key: 'PROJ-1' }], names: {} })
    });
    global.fetch = mockFetch;

    const response = await app.inject({
      method: 'POST',
      url: '/api/jira/search',
      payload: { jql: 'project = PROJ', jira: mockJiraSettings.jira }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.issues).toEqual([{ key: 'PROJ-1' }]);

    // The body sent to Jira must contain the JQL verbatim — no auto-appended issuetype.
    const [, options] = mockFetch.mock.calls[0];
    const sentBody = JSON.parse(options.body);
    expect(sentBody.jql).toBe('project = PROJ');
  });

  it('POST /api/jira/search with include_children fetches Parent Link children and dedupes', async () => {
    const mockFetch = vi.fn()
      // base JQL page
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ issues: [{ key: 'EPIC-1' }], names: {}, total: 1 })
      })
      // child JQL page — echoes the parent (deduped) plus a new child
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ issues: [{ key: 'EPIC-1' }, { key: 'STORY-1' }], names: {}, total: 2 })
      });
    global.fetch = mockFetch;

    const response = await app.inject({
      method: 'POST',
      url: '/api/jira/search',
      payload: { jql: 'project = PROJ', include_children: true, jira: mockJiraSettings.jira }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.issues.map((i: any) => i.key)).toEqual(['EPIC-1', 'STORY-1']);

    // Second call must query children via the "Parent Link" field.
    const [, childOpts] = mockFetch.mock.calls[1];
    expect(JSON.parse(childOpts.body).jql).toBe('"Parent Link" in ("EPIC-1")');
  });

  it('POST /api/jira/search without include_children skips the child query', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ issues: [{ key: 'EPIC-1' }], names: {}, total: 1 })
    });
    global.fetch = mockFetch;

    const response = await app.inject({
      method: 'POST',
      url: '/api/jira/search',
      payload: { jql: 'project = PROJ', jira: mockJiraSettings.jira }
    });

    expect(response.statusCode).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('POST /api/jira/search surfaces JQL/auth errors instead of swallowing them', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({
        errorMessages: ["The value 'Issue' does not exist for the field 'type'."],
        errors: {}
      })
    });
    global.fetch = mockFetch;

    const response = await app.inject({
      method: 'POST',
      url: '/api/jira/search',
      payload: { jql: 'project = PROJ AND issuetype = Issue', jira: mockJiraSettings.jira }
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error).toContain("does not exist for the field 'type'");
  });

  it('POST /api/jira/search falls back to HTTP-status error when Jira returns no errorMessages', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({})
    });
    global.fetch = mockFetch;

    const response = await app.inject({
      method: 'POST',
      url: '/api/jira/search',
      payload: { jql: 'project = PROJ', jira: mockJiraSettings.jira }
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error).toContain('401');
  });
});
