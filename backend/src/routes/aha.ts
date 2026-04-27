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

  fastify.post<{ Body: AhaFeatureBodyType }>('/api/aha/feature', { schema: { body: AhaFeatureBody } }, async (request, reply) => {
    const { reference_num } = request.body;
    if (!reference_num) throw new Error('Aha! Reference Number is required.');

    const { section: aha } = await getIntegrationConfig(
      fastify, request.body, 'aha',
      [['subdomain', 'Aha! Subdomain'], ['api_key', 'Aha! API Key']]
    );
    const { subdomain, api_key } = aha;

    const apiUrl = `https://${subdomain}.aha.io/api/v1/features/${reference_num}`;
    const ahaRes = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${api_key}`
      }
    });

    if (!ahaRes.ok) {
      if (ahaRes.status === 404) throw new Error(`Feature ${reference_num} not found in Aha!.`);
      throw new Error(`Aha! error ${ahaRes.status}: ${ahaRes.statusText}`);
    }

    const data = await ahaRes.json() as any;
    return reply.send({ success: true, feature: data.feature });
  });

  fastify.post<{ Body: AhaFeaturesBodyType }>('/api/aha/features', { schema: { body: AhaFeaturesBody } }, async (request, reply) => {
    const { workspace } = request.body;
    if (!workspace) throw new Error('Aha! Workspace is required.');

    const { section: aha } = await getIntegrationConfig(
      fastify, request.body, 'aha',
      [['subdomain', 'Aha! Subdomain'], ['api_key', 'Aha! API Key']]
    );
    const { subdomain, api_key } = aha;

    const PER_PAGE = 200;
    const MAX_PAGES = 50; // hard ceiling: 10 000 features
    const allFeatures: any[] = [];

    for (let page = 1; page <= MAX_PAGES; page++) {
      const apiUrl = `https://${subdomain}.aha.io/api/v1/products/${encodeURIComponent(workspace)}/features?per_page=${PER_PAGE}&page=${page}`;
      const ahaRes = await fetch(apiUrl, {
        headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${api_key}` }
      });

      if (!ahaRes.ok) {
        if (ahaRes.status === 404) throw new Error(`Aha! workspace "${workspace}" not found.`);
        throw new Error(`Aha! error ${ahaRes.status}: ${ahaRes.statusText}`);
      }

      const data = await ahaRes.json() as any;
      const features = data.features || [];
      allFeatures.push(...features);
      if (features.length < PER_PAGE) break;
    }

    return reply.send({ success: true, features: allFeatures });
  });

};
