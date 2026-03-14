import fp from 'fastify-plugin';
import { startMongoCleanup, stopMongoCleanup, clearMongoCache } from '../utils/mongoServer';

export default fp(async (fastify) => {
  // Start the interval that cleans up idle MongoDB connections
  startMongoCleanup();

  // Ensure we stop the interval and close all cached connections when Fastify shuts down
  fastify.addHook('onClose', async () => {
    stopMongoCleanup();
    clearMongoCache();
  });
});
