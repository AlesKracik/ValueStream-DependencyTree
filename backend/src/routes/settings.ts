import { FastifyPluginAsync } from 'fastify';
import { unmaskSettings } from '../utils/configHelpers';
import { Settings } from '@valuestream/shared-types';
import { SettingsBody } from './schemas';
import { requireRole } from '../utils/roleGuard';

import { getSettingsPath } from '../utils/configHelpers';
// Re-export for backward compatibility with existing imports across routes
export { getSettingsPath };

export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: Settings }>('/api/settings', { schema: { body: SettingsBody } }, async (request, reply) => {
    requireRole(request, 'admin');
    const newData = request.body;

    // Read current full settings (config + secrets) for unmask
    const existingSettings = await fastify.getSettings();

    // Unmask: restore ******** values from existing secrets
    const unmasked = unmaskSettings(newData, existingSettings);

    // Split write: secrets → SecretManager, config → settings.json
    await fastify.saveSettings(unmasked);

    // Verify saved settings include SSO credentials (debug)
    const verified = await fastify.getSettings();
    const appSso = verified?.persistence?.mongo?.app?.auth?.sso;
    if (appSso?.aws_access_key) {
      fastify.log.info(`[Settings] Saved with SSO credentials for app (key starts with ${appSso.aws_access_key.substring(0, 4)}...)`);
    }

    return reply.send({ success: true });
  });
};
