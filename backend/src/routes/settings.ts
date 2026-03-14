import { FastifyPluginAsync } from 'fastify';
import fs from 'fs';
import path from 'path';
import { unmaskSettings } from '../utils/configHelpers';

// Helper to reliably find the settings.json file in the original web-client directory
export const getSettingsPath = () => path.resolve(__dirname, '../../../web-client/settings.json');

export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/api/settings', async (request, reply) => {
    try {
      const newData = request.body as any;
      const settingsPath = getSettingsPath();
      
      const existingSettings = fs.existsSync(settingsPath) 
        ? JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) 
        : {};
        
      const unmasked = unmaskSettings(newData, existingSettings);
      
      // Ensure directory exists if for some reason it doesn't
      const dir = path.dirname(settingsPath);
      if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(settingsPath, JSON.stringify(unmasked, null, 2));
      
      return reply.send({ success: true });
    } catch (e: any) {
      return reply.code(500).send({ success: false, error: e.message });
    }
  });
};
