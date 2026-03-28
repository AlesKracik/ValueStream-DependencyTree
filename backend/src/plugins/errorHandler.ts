import fp from 'fastify-plugin';
import { FastifyError } from 'fastify';
import { AppError } from '../utils/errors';

export default fp(async (fastify) => {
  fastify.setErrorHandler((error: FastifyError | AppError | Error, request, reply) => {
    // Use statusCode from AppError, Fastify validation errors, or default to 500
    const statusCode = (error as AppError).statusCode || (error as FastifyError).statusCode || 500;
    const message = error.message || 'Internal Server Error';

    // Log server errors, skip expected client errors
    if (statusCode >= 500) {
      fastify.log.error(error);
    }

    return reply.code(statusCode).send({ success: false, error: message });
  });
});
