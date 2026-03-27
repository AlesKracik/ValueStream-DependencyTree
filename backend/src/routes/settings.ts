import { FastifyPluginAsync } from 'fastify';
import { unmaskSettings } from '../utils/configHelpers';
import { Settings } from '@valuestream/shared-types';
import { SettingsBody } from './schemas';

import { getSettingsPath } from '../utils/configHelpers';
// Re-export for backward compatibility with existing imports across routes
export { getSettingsPath };

export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: Settings }>('/api/settings', { schema: { body: SettingsBody } }, async (request, reply) => {
    try {
      const newData = request.body;

      // Read current full settings (config + secrets) for unmask
      const existingSettings = await fastify.getSettings();

      // Unmask: restore ******** values from existing secrets
      const unmasked = unmaskSettings(newData, existingSettings);

      // Split write: secrets → SecretManager, config → settings.json
      await fastify.saveSettings(unmasked);

      return reply.send({ success: true });
    } catch (e: any) {
      return reply.code(500).send({ success: false, error: e.message });
    }
  });
};
