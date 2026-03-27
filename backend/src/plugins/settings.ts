import fp from 'fastify-plugin';
import { getFullSettingsAsync, saveFullSettingsAsync, invalidateSettingsCache } from '../services/secretManager';

declare module 'fastify' {
  interface FastifyInstance {
    getSettings: () => Promise<any>;
    saveSettings: (settings: any) => Promise<void>;
    invalidateSettingsCache: () => void;
  }
}

export default fp(async (fastify) => {
  fastify.decorate('getSettings', getFullSettingsAsync);
  fastify.decorate('saveSettings', saveFullSettingsAsync);
  fastify.decorate('invalidateSettingsCache', invalidateSettingsCache);
});
