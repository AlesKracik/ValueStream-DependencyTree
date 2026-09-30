import { describe, it, expect } from 'vitest';
import {
  resolveJiraDeployment, resolveJiraApiVersion, buildJiraConnection,
  buildChildrenJql, buildSearchRequest, jiraErrorMessage,
} from '../jiraClient';

describe('resolveJiraDeployment', () => {
  it('honours an explicit setting', () => {
    expect(resolveJiraDeployment({ deployment: 'cloud', base_url: 'https://jira.corp.com' })).toBe('cloud');
    expect(resolveJiraDeployment({ deployment: 'datacenter', base_url: 'https://x.atlassian.net' })).toBe('datacenter');
  });
  it('infers Cloud from Atlassian hosts and defaults to Data Center', () => {
    expect(resolveJiraDeployment({ base_url: 'https://acme.atlassian.net' })).toBe('cloud');
    expect(resolveJiraDeployment({ base_url: 'https://acme.jira.com/' })).toBe('cloud');
    expect(resolveJiraDeployment({ base_url: 'https://jira.acme.com' })).toBe('datacenter');
    expect(resolveJiraDeployment({ base_url: 'not a url' })).toBe('datacenter');
    expect(resolveJiraDeployment(undefined)).toBe('datacenter');
  });
});

describe('resolveJiraApiVersion', () => {
  it('forces v2 on Data Center', () => {
    expect(resolveJiraApiVersion({ base_url: 'https://jira.acme.com', api_version: '3' })).toBe('2');
  });
  it('defaults to v3 on Cloud but honours v2', () => {
    expect(resolveJiraApiVersion({ deployment: 'cloud' })).toBe('3');
    expect(resolveJiraApiVersion({ deployment: 'cloud', api_version: '2' })).toBe('2');
  });
});

describe('buildJiraConnection', () => {
  it('builds Basic auth for Cloud and strips any path', () => {
    const c = buildJiraConnection({
      base_url: 'https://acme.atlassian.net/jira/software/projects', username: ' me@acme.com ', api_token: 'tok',
    });
    expect(c.deployment).toBe('cloud');
    expect(c.apiBase).toBe('https://acme.atlassian.net/rest/api/3');
    expect(c.headers.Authorization).toBe(`Basic ${Buffer.from('me@acme.com:tok').toString('base64')}`);
  });
  it('builds Bearer auth for Data Center and keeps the context path', () => {
    const c = buildJiraConnection({ base_url: 'https://corp.com/jira/browse/ABC-1', api_token: 'pat' });
    expect(c.apiBase).toBe('https://corp.com/jira/rest/api/2');
    expect(c.headers.Authorization).toBe('Bearer pat');
  });
  it('rejects missing credentials with a 400', () => {
    expect(() => buildJiraConnection({ base_url: 'https://a.atlassian.net', api_token: 't' }))
      .toThrow(/e-mail/);
    expect(() => buildJiraConnection({ base_url: 'https://jira.corp.com' })).toThrow(/PAT/);
    try { buildJiraConnection({ base_url: 'nope', api_token: 't' }); } catch (e: any) {
      expect(e.statusCode).toBe(400);
    }
  });
});

describe('buildChildrenJql / buildSearchRequest', () => {
  it('uses parent on Cloud and "Parent Link" on Data Center', () => {
    expect(buildChildrenJql(['A-1', 'A-2'], 'cloud')).toBe('parent in ("A-1", "A-2")');
    expect(buildChildrenJql(['A-1'], 'datacenter')).toBe('"Parent Link" in ("A-1")');
  });
  it('builds the right search request per deployment', () => {
    const cloud = buildSearchRequest({ deployment: 'cloud', apiBase: 'https://a/rest/api/3' }, 'q', 100, { startAt: 0, nextPageToken: 'x' });
    expect(cloud.url).toBe('https://a/rest/api/3/search/jql');
    expect(cloud.body).toEqual({ jql: 'q', maxResults: 100, fields: ['*navigable'], expand: 'names', nextPageToken: 'x' });
    const dc = buildSearchRequest({ deployment: 'datacenter', apiBase: 'https://b/rest/api/2' }, 'q', 100, { startAt: 200 });
    expect(dc.url).toBe('https://b/rest/api/2/search');
    expect(dc.body).toEqual({ jql: 'q', expand: ['names'], maxResults: 100, startAt: 200 });
  });
});

describe('jiraErrorMessage', () => {
  it('joins errorMessages and field errors', () => {
    expect(jiraErrorMessage(400, { errorMessages: ['bad jql'], errors: { jql: 'x' } })).toBe('bad jql; jql: x');
  });
  it('adds deployment-specific 401 hints', () => {
    expect(jiraErrorMessage(401, {}, 'cloud')).toMatch(/do not accept PATs|does not accept PATs/);
    expect(jiraErrorMessage(401, {}, 'datacenter')).toMatch(/Personal Access Token/);
  });
});
