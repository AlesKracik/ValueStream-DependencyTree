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

export const jiraRoutes: FastifyPluginAsync = async (fastify) => {

  fastify.post<{ Body: JiraConfigBodyType }>('/api/jira/test', { schema: { body: JiraConfigBody } }, async (request, reply) => {
    try {
      const { section: jira } = await getIntegrationConfig(
        fastify, request.body, 'jira', [['base_url', 'Jira Base URL']]
      );
      const { base_url, api_token } = jira;
      const api_version = jira.api_version || '3';

      let origin;
      try { origin = new URL(base_url).origin; } catch (e) { throw new Error(`Invalid Jira Base URL: "${base_url}".`); }

      const apiUrl = `${origin}/rest/api/${api_version}/myself`;
      const jiraRes = await fetch(apiUrl, { headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${api_token}` } });

      if (!jiraRes.ok) throw new Error(`Jira error ${jiraRes.status}`);

      return reply.send({ success: true, message: 'Connected!' });
    } catch (e: any) {
      return reply.send({ success: false, error: e.message });
    }
  });

  fastify.post<{ Body: JiraIssueBodyType }>('/api/jira/issue', { schema: { body: JiraIssueBody } }, async (request, reply) => {
    const { full: config, section: jira } = await getIntegrationConfig(
      fastify, request.body, 'jira', [['base_url', 'Jira Base URL']]
    );
    const { base_url, api_token } = jira;
    const api_version = jira.api_version || '3';
    const jira_key = config.jira_key;

    let origin;
    try { origin = new URL(base_url).origin; } catch (e) { throw new Error(`Invalid Jira Base URL: "${base_url}".`); }

    const apiUrl = `${origin}/rest/api/${api_version}/issue/${jira_key}?expand=names`;
    const jiraRes = await fetch(apiUrl, { headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${api_token}` } });

    return reply.send({ success: true, data: await jiraRes.json() });
  });

  fastify.post<{ Body: JiraSearchBodyType }>('/api/jira/search', { schema: { body: JiraSearchBody } }, async (request, reply) => {
    const { full: config, section: jira } = await getIntegrationConfig(
      fastify, request.body, 'jira', [['base_url', 'Jira Base URL']]
    );
    const { base_url, api_token } = jira;
    const api_version = jira.api_version || '3';
    const jql = config.jql;
    const includeChildren = config.include_children === true;

    let origin;
    try { origin = new URL(base_url).origin; } catch (e) { throw new Error(`Invalid Jira Base URL: "${base_url}".`); }

    const apiUrl = `${origin}/rest/api/${api_version}/search`;

    // One paginated Jira /search call. Throws (with statusCode) on a non-OK
    // response so callers can surface the original Jira error + HTTP status.
    const fetchPage: JiraFetchPage = async (q, startAt) => {
      const jiraRes = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'Authorization': `Bearer ${api_token}` },
        body: JSON.stringify({ jql: q, expand: ['names'], maxResults: PAGE_SIZE, startAt })
      });
      const body: any = await jiraRes.json().catch(() => ({}));
      if (!jiraRes.ok) {
        const errorMessages = Array.isArray(body?.errorMessages) && body.errorMessages.length > 0
          ? body.errorMessages.join('; ')
          : `Jira returned HTTP ${jiraRes.status}`;
        const err: any = new Error(errorMessages);
        err.statusCode = jiraRes.status;
        throw err;
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
          onChunkError: (keys, err) => fastify.log.warn({ err, keys }, 'Jira Parent Link child batch failed'),
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
