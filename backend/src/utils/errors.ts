/**
 * Application error with HTTP status code.
 * Thrown in route handlers and caught by the global Fastify error handler plugin.
 */
export class AppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
  }
}
