import { FastifyPluginAsync } from 'fastify';
import { unmaskSettings } from '../utils/configHelpers';
import { getFullSettings, saveFullSettings } from '../services/secretManager';

import { getSettingsPath } from '../utils/configHelpers';
// Re-export for backward compatibility with existing imports across routes
export { getSettingsPath };

export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/api/settings', async (request, reply) => {
    try {
      const newData = request.body as any;

      // Read current full settings (config + secrets) for unmask
      const existingSettings = getFullSettings();

      // Unmask: restore ******** values from existing secrets
      const unmasked = unmaskSettings(newData, existingSettings);

      // Split write: secrets → SecretManager, config → settings.json
      saveFullSettings(unmasked);

      return reply.send({ success: true });
    } catch (e: any) {
      return reply.code(500).send({ success: false, error: e.message });
    }
  });
};
