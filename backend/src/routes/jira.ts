import { FastifyPluginAsync } from 'fastify';
import { unmaskSettings } from '../utils/configHelpers';
import {
  JiraConfigBody, JiraConfigBodyType,
  JiraIssueBody, JiraIssueBodyType,
  JiraSearchBody, JiraSearchBodyType
} from './schemas';

export const jiraRoutes: FastifyPluginAsync = async (fastify) => {

  fastify.post<{ Body: JiraConfigBodyType }>('/api/jira/test', { schema: { body: JiraConfigBody } }, async (request, reply) => {
    try {
      const rawConfig = request.body;
      const existing = await fastify.getSettings();

      const config = unmaskSettings(rawConfig, existing);
      const jira = config.jira || {};
      const base_url = jira.base_url;
      const api_version = jira.api_version || '3';
      const api_token = jira.api_token;

      if (!base_url) throw new Error('Jira Base URL is not configured in settings.');

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
      const rawConfig = request.body;
      const existing = await fastify.getSettings();

      const config = unmaskSettings(rawConfig, existing);
      const jira = config.jira || {};
      const base_url = jira.base_url;
      const api_version = jira.api_version || '3';
      const api_token = jira.api_token;
      const jira_key = config.jira_key;

      if (!base_url) throw new Error('Jira Base URL is not configured in settings.');

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
      const rawConfig = request.body;
      const existing = await fastify.getSettings();

      const config = unmaskSettings(rawConfig, existing);
      const jira = config.jira || {};
      const base_url = jira.base_url;
      const api_version = jira.api_version || '3';
      const api_token = jira.api_token;
      const jql = config.jql;

      if (!base_url) throw new Error('Jira Base URL is not configured in settings.');

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
