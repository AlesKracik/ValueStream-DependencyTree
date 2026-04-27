import { FastifyPluginAsync } from 'fastify';
import { getIntegrationConfig } from '../utils/configHelpers';
import { AhaConfigBody, AhaConfigBodyType, AhaFeatureBody, AhaFeatureBodyType } from './schemas';

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

};
