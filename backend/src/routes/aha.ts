import { FastifyPluginAsync } from 'fastify';
import { getIntegrationConfig } from '../utils/configHelpers';
import {
  AhaConfigBody, AhaConfigBodyType,
  AhaFeatureBody, AhaFeatureBodyType,
  AhaFeaturesBody, AhaFeaturesBodyType
} from './schemas';

export const ahaRoutes: FastifyPluginAsync = async (fastify) => {

  fastify.post<{ Body: AhaConfigBodyType }>('/api/aha/test', { schema: { body: AhaConfigBody } }, async (request, reply) => {
    try {
      const { section: aha } = await getIntegrationConfig(
        fastify, request.body, 'aha',
        [['subdomain', 'Aha! Subdomain'], ['api_key', 'Aha! API Key']]
      );
      const { subdomain, api_key } = aha;

      const apiUrl = `https://${subdomain}.aha.io/api/v1/features`;
      const ahaRes = await fetch(apiUrl, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${api_key}`
        }
      });

      if (!ahaRes.ok) throw new Error(`Aha! error ${ahaRes.status}: ${ahaRes.statusText}`);

      return reply.send({ success: true, message: 'Connected!' });
    } catch (e: any) {
      return reply.send({ success: false, error: e.message });
    }
  });

  // Fetch one Aha! record by reference number: a feature, or an epic (what
  // some Aha! workspaces call a "feature set").
  const fetchRecord = async (body: AhaFeatureBodyType, kind: 'features' | 'epics') => {
    const { reference_num } = body;
    if (!reference_num) throw new Error('Aha! Reference Number is required.');

    const { section: aha } = await getIntegrationConfig(
      fastify, body, 'aha',
      [['subdomain', 'Aha! Subdomain'], ['api_key', 'Aha! API Key']]
    );
    const { subdomain, api_key } = aha;

    const apiUrl = `https://${subdomain}.aha.io/api/v1/${kind}/${reference_num}`;
    const ahaRes = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${api_key}`
      }
    });

    if (!ahaRes.ok) {
      if (ahaRes.status === 404) throw new Error(`${kind === 'epics' ? 'Epic' : 'Feature'} ${reference_num} not found in Aha!.`);
      throw new Error(`Aha! error ${ahaRes.status}: ${ahaRes.statusText}`);
    }

    const data = await ahaRes.json() as any;
    return kind === 'epics' ? data.epic : data.feature;
  };

  // List every record of a workspace (Aha! REST "product"), page by page. The
  // list endpoints return only summary fields by default, so ask for every
  // field the web client's parseAhaFeature reads — import then stores the
  // same data as a per-record sync. `description` and `requirements` come back
  // as the full nested objects (description.body, requirement id/name/
  // description/url); a feature's `epic` is its epic object, or null.
  const listRecords = async (body: AhaFeaturesBodyType, kind: 'features' | 'epics', fields: string) => {
    const { workspace } = body;
    if (!workspace) throw new Error('Aha! Workspace is required.');

    const { section: aha } = await getIntegrationConfig(
      fastify, body, 'aha',
      [['subdomain', 'Aha! Subdomain'], ['api_key', 'Aha! API Key']]
    );
    const { subdomain, api_key } = aha;

    const PER_PAGE = 200;
    const MAX_PAGES = 50; // hard ceiling: 10 000 records
    const all: any[] = [];

    for (let page = 1; page <= MAX_PAGES; page++) {
      const apiUrl = `https://${subdomain}.aha.io/api/v1/products/${encodeURIComponent(workspace)}/${kind}?per_page=${PER_PAGE}&page=${page}&fields=${fields}`;
      const ahaRes = await fetch(apiUrl, {
        headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${api_key}` }
      });

      if (!ahaRes.ok) {
        if (ahaRes.status === 404) throw new Error(`Aha! workspace "${workspace}" not found.`);
        throw new Error(`Aha! error ${ahaRes.status}: ${ahaRes.statusText}`);
      }

      const data = await ahaRes.json() as any;
      const records = data[kind] || [];
      all.push(...records);
      if (records.length < PER_PAGE) break;
    }
    return all;
  };

  const FEATURE_FIELDS = 'id,reference_num,name,url,score,description,original_estimate,requirements,epic';
  const EPIC_FIELDS = 'id,reference_num,name,url,score,description,original_estimate';

  fastify.post<{ Body: AhaFeatureBodyType }>('/api/aha/feature', { schema: { body: AhaFeatureBody } }, async (request, reply) => {
    const feature = await fetchRecord(request.body, 'features');
    return reply.send({ success: true, feature });
  });

  fastify.post<{ Body: AhaFeatureBodyType }>('/api/aha/epic', { schema: { body: AhaFeatureBody } }, async (request, reply) => {
    const epic = await fetchRecord(request.body, 'epics');
    return reply.send({ success: true, epic });
  });

  fastify.post<{ Body: AhaFeaturesBodyType }>('/api/aha/features', { schema: { body: AhaFeaturesBody } }, async (request, reply) => {
    const features = await listRecords(request.body, 'features', FEATURE_FIELDS);
    return reply.send({ success: true, features });
  });

  fastify.post<{ Body: AhaFeaturesBodyType }>('/api/aha/epics', { schema: { body: AhaFeaturesBody } }, async (request, reply) => {
    const epics = await listRecords(request.body, 'epics', EPIC_FIELDS);
    return reply.send({ success: true, epics });
  });

};
