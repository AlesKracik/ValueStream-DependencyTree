import { buildApp } from './app';

const PORT = parseInt(process.env.PORT || '4000', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function start() {
  try {
    const app = await buildApp();
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`Server listening on http://${HOST}:${PORT}`);
  } catch (err) {
    const logger = (await import('./utils/logger')).default;
    logger.error(err, 'Server startup failed');
    process.exit(1);
  }
}

start();
