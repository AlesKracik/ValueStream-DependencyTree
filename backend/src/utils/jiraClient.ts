// Jira connection helpers that paper over the differences between Jira Cloud
// and Jira Data Center / Server:
//
//   | Concern      | Cloud                                   | Data Center / Server            |
//   |--------------|-----------------------------------------|---------------------------------|
//   | Auth         | Basic base64(email:API token)           | Bearer <Personal Access Token>  |
//   | REST version | 2 or 3                                  | 2 only (no /rest/api/3)         |
//   | JQL search   | POST /search/jql, nextPageToken paging, | POST /search, startAt/total     |
//   |              | only `id` returned unless `fields` set  | paging, navigable fields        |
//   | Hierarchy    | system `parent` field (all levels)      | Advanced Roadmaps "Parent Link" |
//
// Kept free of Fastify so it can be unit-tested directly. Mirrors
// resolveJiraDeployment / resolveJiraApiVersion in @valuestream/shared-types
// (the backend is CommonJS and does not import runtime code from that ESM
// package).

import { AppError } from './errors';

export type JiraDeployment = 'cloud' | 'datacenter';

export interface JiraConnectionSettings {
  base_url?: string;
  deployment?: string;
  api_version?: string;
  username?: string;
  api_token?: string;
}

const CLOUD_HOST_SUFFIXES = ['.atlassian.net', '.jira.com', '.jira-dev.com'];

/** Explicit `deployment` wins; otherwise infer Cloud from an Atlassian host. */
export function resolveJiraDeployment(jira: JiraConnectionSettings | undefined | null): JiraDeployment {
  if (jira?.deployment === 'cloud' || jira?.deployment === 'datacenter') return jira.deployment;
  if (jira?.base_url) {
    try {
      const host = new URL(jira.base_url).hostname.toLowerCase();
      if (CLOUD_HOST_SUFFIXES.some((sfx) => host.endsWith(sfx))) return 'cloud';
    } catch { /* invalid URL — validated separately */ }
  }
  return 'datacenter';
}

/** Data Center only has REST v2; Cloud honours the setting (default 3). */
export function resolveJiraApiVersion(jira: JiraConnectionSettings | undefined | null): '2' | '3' {
  if (resolveJiraDeployment(jira) === 'datacenter') return '2';
  return jira?.api_version === '2' ? '2' : '3';
}

export interface JiraConnection {
  deployment: JiraDeployment;
  apiVersion: '2' | '3';
  /** `${origin}${contextPath}/rest/api/${apiVersion}` */
  apiBase: string;
  headers: Record<string, string>;
}

/**
 * Validate settings and build everything needed to call Jira. Throws a
 * user-facing Error when required settings are missing or invalid.
 */
export function buildJiraConnection(jira: JiraConnectionSettings): JiraConnection {
  const deployment = resolveJiraDeployment(jira);
  const apiVersion = resolveJiraApiVersion(jira);

  let parsed: URL;
  try { parsed = new URL(jira.base_url || ''); } catch {
    throw new AppError(`Invalid Jira Base URL: "${jira.base_url}".`, 400);
  }
  // Data Center is often served under a context path (https://host/jira) —
  // keep it, but drop anything pasted after it such as "/browse/ABC-1".
  // Cloud never has a context path.
  let contextPath = '';
  if (deployment === 'datacenter') {
    contextPath = parsed.pathname
      .replace(/\/(browse|secure|projects|issues|rest|plugins)(\/.*)?$/i, '')
      .replace(/\/+$/, '');
  }

  const token = (jira.api_token || '').trim();
  if (!token) {
    throw new AppError(deployment === 'cloud'
      ? 'Jira API token is not configured in settings.'
      : 'Jira Personal Access Token (PAT) is not configured in settings.', 400);
  }

  let authorization: string;
  if (deployment === 'cloud') {
    const username = (jira.username || '').trim();
    if (!username) {
      throw new AppError('Jira Cloud requires the Atlassian account e-mail together with the API token.', 400);
    }
    authorization = `Basic ${Buffer.from(`${username}:${token}`).toString('base64')}`;
  } else {
    authorization = `Bearer ${token}`;
  }

  return {
    deployment,
    apiVersion,
    apiBase: `${parsed.origin}${contextPath}/rest/api/${apiVersion}`,
    headers: { 'Accept': 'application/json', 'Authorization': authorization },
  };
}

/** Pull a readable message out of a Jira error response body. */
export function jiraErrorMessage(status: number, body: any, deployment?: JiraDeployment): string {
  const parts: string[] = [];
  if (Array.isArray(body?.errorMessages)) parts.push(...body.errorMessages.filter(Boolean));
  if (body?.errors && typeof body.errors === 'object' && !Array.isArray(body.errors)) {
    for (const [k, v] of Object.entries(body.errors)) parts.push(`${k}: ${v}`);
  }
  if (parts.length === 0 && typeof body?.message === 'string' && body.message) parts.push(body.message);
  let msg = parts.length > 0 ? parts.join('; ') : `Jira returned HTTP ${status}`;
  if (status === 401) {
    msg += deployment === 'cloud'
      ? ' (check the account e-mail and API token; Jira Cloud does not accept PATs)'
      : ' (check the Personal Access Token)';
  } else if (status === 404 && parts.length === 0) {
    msg += ' (endpoint not found; check the Base URL, deployment type and API version)';
  }
  return msg;
}

/** JQL clause selecting direct children of the given parent keys. */
export function buildChildrenJql(keys: string[], deployment: JiraDeployment = 'datacenter'): string {
  const quoted = keys.map((k) => `"${k}"`).join(', ');
  // Cloud replaced "Epic Link"/"Parent Link" with the system `parent` field,
  // which covers every hierarchy level. Data Center keeps Advanced Roadmaps'
  // "Parent Link" custom field.
  return deployment === 'cloud' ? `parent in (${quoted})` : `"Parent Link" in (${quoted})`;
}

/** URL + body for one page of a JQL search on the given deployment. */
export function buildSearchRequest(
  conn: Pick<JiraConnection, 'deployment' | 'apiBase'>,
  jql: string,
  pageSize: number,
  cursor: { startAt: number; nextPageToken?: string },
): { url: string; body: Record<string, unknown> } {
  if (conn.deployment === 'cloud') {
    // The classic /search endpoint was removed from Jira Cloud. /search/jql
    // pages with nextPageToken, returns no `total`, returns only `id` unless
    // fields are requested, and takes `expand` as a comma-separated string.
    const body: Record<string, unknown> = {
      jql,
      maxResults: pageSize,
      fields: ['*navigable'],
      expand: 'names',
    };
    if (cursor.nextPageToken) body.nextPageToken = cursor.nextPageToken;
    return { url: `${conn.apiBase}/search/jql`, body };
  }
  return {
    url: `${conn.apiBase}/search`,
    body: { jql, expand: ['names'], maxResults: pageSize, startAt: cursor.startAt },
  };
}
