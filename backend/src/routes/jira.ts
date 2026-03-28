import { FastifyPluginAsync } from 'fastify';
import { getIntegrationConfig } from '../utils/configHelpers';
import {
  JiraConfigBody, JiraConfigBodyType,
  JiraIssueBody, JiraIssueBodyType,
  JiraSearchBody, JiraSearchBodyType
} from './schemas';

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
    try {
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
    } catch (e: any) {
      return reply.code(500).send({ success: false, error: e.message });
    }
  });

  fastify.post<{ Body: JiraSearchBodyType }>('/api/jira/search', { schema: { body: JiraSearchBody } }, async (request, reply) => {
    try {
      const { full: config, section: jira } = await getIntegrationConfig(
        fastify, request.body, 'jira', [['base_url', 'Jira Base URL']]
      );
      const { base_url, api_token } = jira;
      const api_version = jira.api_version || '3';
      const jql = config.jql;

      let origin;
      try { origin = new URL(base_url).origin; } catch (e) { throw new Error(`Invalid Jira Base URL: "${base_url}".`); }

      const apiUrl = `${origin}/rest/api/${api_version}/search`;
      const jiraRes = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'Authorization': `Bearer ${api_token}` },
        body: JSON.stringify({ jql, expand: ['names'], maxResults: 100 })
      });

      return reply.send({ success: true, data: await jiraRes.json() });
    } catch (e: any) {
      return reply.code(500).send({ success: false, error: e.message });
    }
  });

};
