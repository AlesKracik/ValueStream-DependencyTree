import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildApp } from '../../app';
import fs from 'fs';
import { invalidateSettingsCache } from '../../services/secretManager';

vi.mock('fs');

// Data Center / Server: PAT sent as Bearer, REST v2, classic /search.
const mockJiraSettings = {
  jira: {
    base_url: 'https://jira.example.com',
    api_token: 'test-token',
    api_version: '2'
  }
};

// Cloud: e-mail + API token (Basic), REST v3, /search/jql token paging.
const mockCloudJira = {
  base_url: 'https://example.atlassian.net',
  deployment: 'cloud',
  username: 'me@example.com',
  api_token: 'cloud-token',
  api_version: '3'
};
const expectedBasic = `Basic ${Buffer.from('me@example.com:cloud-token').toString('base64')}`;

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

  // ── Data Center specifics ─────────────────────────────────────────────────

  it('Data Center: uses Bearer PAT, /rest/api/2/search and offset paging', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({ issues: [{ key: 'A-1' }], names: {}, total: 1 })
    });
    global.fetch = mockFetch;

    await app.inject({
      method: 'POST', url: '/api/jira/search',
      // api_version 3 must be coerced to 2 — DC has no /rest/api/3
      payload: { jql: 'project = A', jira: { ...mockJiraSettings.jira, api_version: '3' } }
    });

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://jira.example.com/rest/api/2/search');
    expect(opts.headers.Authorization).toBe('Bearer test-token');
    const sent = JSON.parse(opts.body);
    expect(sent.startAt).toBe(0);
    expect(sent.expand).toEqual(['names']);
  });

  it('Data Center: keeps a context path in the base URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: () => Promise.resolve({ name: 'jdoe' })
    });
    global.fetch = mockFetch;

    const response = await app.inject({
      method: 'POST', url: '/api/jira/test',
      payload: { jira: { ...mockJiraSettings.jira, base_url: 'https://corp.example.com/jira/' } }
    });

    expect(JSON.parse(response.body).success).toBe(true);
    expect(mockFetch.mock.calls[0][0]).toBe('https://corp.example.com/jira/rest/api/2/myself');
  });

  // ── Cloud specifics ───────────────────────────────────────────────────────

  it('Cloud: test connection uses Basic auth (e-mail + API token)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: () => Promise.resolve({ displayName: 'Me' })
    });
    global.fetch = mockFetch;

    const response = await app.inject({
      method: 'POST', url: '/api/jira/test', payload: { jira: mockCloudJira }
    });

    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.message).toContain('Jira Cloud');
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://example.atlassian.net/rest/api/3/myself');
    expect(opts.headers.Authorization).toBe(expectedBasic);
  });

  it('Cloud: deployment is auto-detected from an atlassian.net URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: () => Promise.resolve({})
    });
    global.fetch = mockFetch;

    const { deployment, ...autoDetect } = mockCloudJira;
    void deployment;
    await app.inject({ method: 'POST', url: '/api/jira/test', payload: { jira: autoDetect } });

    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe(expectedBasic);
  });

  it('Cloud: missing e-mail is reported instead of sending a request', async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    const response = await app.inject({
      method: 'POST', url: '/api/jira/test',
      payload: { jira: { ...mockCloudJira, username: '' } }
    });

    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/e-mail/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('Cloud: search uses /search/jql, requests fields, and follows nextPageToken', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve({
          issues: [{ key: 'C-1' }], names: { customfield_1: 'Target start' },
          nextPageToken: 'tok-2', isLast: false
        })
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve({ issues: [{ key: 'C-2' }], isLast: true })
      });
    global.fetch = mockFetch;

    const response = await app.inject({
      method: 'POST', url: '/api/jira/search',
      payload: { jql: 'project = C', jira: mockCloudJira }
    });

    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.issues.map((i: any) => i.key)).toEqual(['C-1', 'C-2']);
    expect(body.data.names).toEqual({ customfield_1: 'Target start' });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [url1, opts1] = mockFetch.mock.calls[0];
    expect(url1).toBe('https://example.atlassian.net/rest/api/3/search/jql');
    expect(opts1.headers.Authorization).toBe(expectedBasic);
    const sent1 = JSON.parse(opts1.body);
    expect(sent1.fields).toEqual(['*navigable']);
    expect(sent1.expand).toBe('names');
    expect(sent1.startAt).toBeUndefined();
    expect(sent1.nextPageToken).toBeUndefined();
    expect(JSON.parse(mockFetch.mock.calls[1][1].body).nextPageToken).toBe('tok-2');
  });

  it('Cloud: include_children follows the system parent field', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve({ issues: [{ key: 'EPIC-1' }], isLast: true })
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve({ issues: [{ key: 'STORY-1' }], isLast: true })
      });
    global.fetch = mockFetch;

    const response = await app.inject({
      method: 'POST', url: '/api/jira/search',
      payload: { jql: 'project = C', include_children: true, jira: mockCloudJira }
    });

    expect(JSON.parse(response.body).data.issues.map((i: any) => i.key)).toEqual(['EPIC-1', 'STORY-1']);
    expect(JSON.parse(mockFetch.mock.calls[1][1].body).jql).toBe('parent in ("EPIC-1")');
  });

  it('Cloud: 401 error hints that PATs are not accepted', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({}) });

    const response = await app.inject({
      method: 'POST', url: '/api/jira/search',
      payload: { jql: 'project = C', jira: mockCloudJira }
    });

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).error).toMatch(/API token/);
  });

  it('POST /api/jira/issue propagates Jira errors instead of returning success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 404,
      json: () => Promise.resolve({ errorMessages: ['Issue does not exist or you do not have permission to see it.'] })
    });

    const response = await app.inject({
      method: 'POST', url: '/api/jira/issue',
      payload: { jira_key: 'NOPE-1', jira: mockCloudJira }
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error).toContain('does not exist');
  });
});
