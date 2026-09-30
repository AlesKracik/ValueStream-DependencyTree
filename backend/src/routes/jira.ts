import { FastifyPluginAsync } from 'fastify';
import { getIntegrationConfig } from '../utils/configHelpers';
import {
  JiraConfigBody, JiraConfigBodyType,
  JiraIssueBody, JiraIssueBodyType,
  JiraSearchBody, JiraSearchBodyType
} from './schemas';
import {
  PAGE_SIZE, JiraFetchPage, searchAllPages, expandChildren
} from '../utils/jiraSearch';
import {
  buildJiraConnection, buildSearchRequest, buildChildrenJql, jiraErrorMessage
} from '../utils/jiraClient';

export const jiraRoutes: FastifyPluginAsync = async (fastify) => {

  fastify.post<{ Body: JiraConfigBodyType }>('/api/jira/test', { schema: { body: JiraConfigBody } }, async (request, reply) => {
    try {
      const { section: jira } = await getIntegrationConfig(
        fastify, request.body, 'jira', [['base_url', 'Jira Base URL']]
      );
      const conn = buildJiraConnection(jira);

      const jiraRes = await fetch(`${conn.apiBase}/myself`, { headers: conn.headers });
      const body: any = await jiraRes.json().catch(() => ({}));
      if (!jiraRes.ok) throw new Error(jiraErrorMessage(jiraRes.status, body, conn.deployment));

      const who = body?.displayName || body?.emailAddress || body?.name;
      const flavour = conn.deployment === 'cloud' ? 'Jira Cloud' : 'Jira Data Center';
      return reply.send({
        success: true,
        message: `Connected to ${flavour} (REST v${conn.apiVersion})${who ? ` as ${who}` : ''}.`,
      });
    } catch (e: any) {
      return reply.send({ success: false, error: e.message });
    }
  });

  fastify.post<{ Body: JiraIssueBodyType }>('/api/jira/issue', { schema: { body: JiraIssueBody } }, async (request, reply) => {
    const { full: config, section: jira } = await getIntegrationConfig(
      fastify, request.body, 'jira', [['base_url', 'Jira Base URL']]
    );
    const conn = buildJiraConnection(jira);
    const jira_key = encodeURIComponent(String(config.jira_key));

    const jiraRes = await fetch(`${conn.apiBase}/issue/${jira_key}?expand=names`, { headers: conn.headers });
    const body: any = await jiraRes.json().catch(() => ({}));
    if (!jiraRes.ok) {
      return reply.code(jiraRes.status).send({
        success: false, error: jiraErrorMessage(jiraRes.status, body, conn.deployment),
      });
    }

    return reply.send({ success: true, data: body });
  });

  fastify.post<{ Body: JiraSearchBodyType }>('/api/jira/search', { schema: { body: JiraSearchBody } }, async (request, reply) => {
    const { full: config, section: jira } = await getIntegrationConfig(
      fastify, request.body, 'jira', [['base_url', 'Jira Base URL']]
    );
    const conn = buildJiraConnection(jira);
    const jql = config.jql;
    const includeChildren = config.include_children === true;

    // One page of a Jira search (Cloud: /search/jql + nextPageToken; Data
    // Center: /search + startAt). Throws (with statusCode) on a non-OK
    // response so callers can surface the original Jira error + HTTP status.
    const fetchPage: JiraFetchPage = async (q, startAt, nextPageToken) => {
      const req = buildSearchRequest(conn, q, PAGE_SIZE, { startAt, nextPageToken });
      const jiraRes = await fetch(req.url, {
        method: 'POST',
        headers: { ...conn.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body)
      });
      const body: any = await jiraRes.json().catch(() => ({}));
      if (!jiraRes.ok) {
        const err: any = new Error(jiraErrorMessage(jiraRes.status, body, conn.deployment));
        err.statusCode = jiraRes.status;
        throw err;
      }
      if (conn.deployment === 'cloud') {
        return {
          issues: body.issues || [],
          names: body.names || {},
          nextPageToken: body.nextPageToken,
          // Treat a missing isLast as "last" when there's no token to follow.
          isLast: body.isLast ?? !body.nextPageToken,
        };
      }
      return { issues: body.issues || [], names: body.names || {}, total: body.total };
    };

    try {
      const base = await searchAllPages(fetchPage, jql);

      // Dedupe by issue key; base results win over any child re-fetch.
      const byKey = new Map<string, any>();
      for (const issue of base.issues) byKey.set(issue.key, issue);
      let names: Record<string, string> = { ...base.names };
      let warning: string | undefined;

      if (includeChildren && byKey.size > 0) {
        const exp = await expandChildren(fetchPage, [...byKey.keys()], byKey, {
          buildJql: (keys) => buildChildrenJql(keys, conn.deployment),
          onChunkError: (keys, err) => fastify.log.warn({ err, keys }, 'Jira child batch failed'),
        });
        names = { ...exp.names, ...names };
        if (exp.failedChunks > 0) {
          warning = `${exp.failedChunks} child batch(es) failed to fetch; import may be incomplete.`;
        }
      }

      return reply.send({
        success: true,
        data: { issues: [...byKey.values()], names, ...(warning ? { warning } : {}) },
      });
    } catch (e: any) {
      const status = typeof e?.statusCode === 'number' ? e.statusCode : 500;
      return reply.code(status).send({ success: false, error: e?.message || 'Jira search failed' });
    }
  });

};
