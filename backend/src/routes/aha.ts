import { FastifyPluginAsync } from 'fastify';
import { unmaskSettings } from '../utils/configHelpers';
import { AhaConfigBody, AhaConfigBodyType, AhaFeatureBody, AhaFeatureBodyType } from './schemas';

export const ahaRoutes: FastifyPluginAsync = async (fastify) => {

  fastify.post<{ Body: AhaConfigBodyType }>('/api/aha/test', { schema: { body: AhaConfigBody } }, async (request, reply) => {
    try {
      const rawConfig = request.body;
      const existing = await fastify.getSettings();

      const config = unmaskSettings(rawConfig, existing);
      const aha = config.aha || {};
      const subdomain = aha.subdomain;
      const api_key = aha.api_key;

      if (!subdomain) throw new Error('Aha! Subdomain is not configured.');
      if (!api_key) throw new Error('Aha! API Key is not configured.');

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
    try {
      const { reference_num } = request.body;
      if (!reference_num) throw new Error('Aha! Reference Number is required.');

      const existing = await fastify.getSettings();

      const aha = existing.aha || {};
      const subdomain = aha.subdomain;
      const api_key = aha.api_key;

      if (!subdomain) throw new Error('Aha! Subdomain is not configured in settings.');
      if (!api_key) throw new Error('Aha! API Key is not configured in settings.');

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
    } catch (e: any) {
      return reply.code(500).send({ success: false, error: e.message });
    }
  });

};
