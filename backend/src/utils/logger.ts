import pino from 'pino';

/**
 * Standalone Pino logger for modules that don't have access to the Fastify instance.
 * Uses the same Pino library that Fastify uses internally, ensuring consistent
 * log format and levels across the entire backend.
 */
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

export default logger;
