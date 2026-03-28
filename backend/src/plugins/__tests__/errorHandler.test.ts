import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import errorHandlerPlugin from '../errorHandler';
import { AppError } from '../../utils/errors';

describe('Error Handler Plugin', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);

    // Route that throws a plain Error (should become 500)
    app.get('/test/plain-error', async () => {
      throw new Error('Something went wrong');
    });

    // Route that throws an AppError with custom status
    app.get('/test/app-error', async () => {
      throw new AppError('Not found', 404);
    });

    // Route that throws an AppError with 403
    app.get('/test/forbidden', async () => {
      throw new AppError('Forbidden', 403);
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return 500 with standard format for plain errors', async () => {
    const response = await app.inject({ method: 'GET', url: '/test/plain-error' });
    expect(response.statusCode).toBe(500);
    const json = JSON.parse(response.payload);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Something went wrong');
  });

  it('should use statusCode from AppError', async () => {
    const response = await app.inject({ method: 'GET', url: '/test/app-error' });
    expect(response.statusCode).toBe(404);
    const json = JSON.parse(response.payload);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Not found');
  });

  it('should handle 403 AppError', async () => {
    const response = await app.inject({ method: 'GET', url: '/test/forbidden' });
    expect(response.statusCode).toBe(403);
    const json = JSON.parse(response.payload);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Forbidden');
  });

  it('should return 400 with standard format for schema validation errors', async () => {
    // Request to a non-existent route returns 404 from Fastify's default handler,
    // but schema validation errors (400) go through our handler
    const validationApp = Fastify({ logger: false });
    await validationApp.register(errorHandlerPlugin);

    const { Type } = await import('@sinclair/typebox');
    validationApp.post('/test/validated', { schema: { body: Type.Object({ name: Type.String() }) } }, async () => {
      return { ok: true };
    });
    await validationApp.ready();

    const response = await validationApp.inject({
      method: 'POST',
      url: '/test/validated',
      payload: { wrong_field: 123 }
    });

    expect(response.statusCode).toBe(400);
    const json = JSON.parse(response.payload);
    expect(json.success).toBe(false);
    expect(json.error).toBeDefined();

    await validationApp.close();
  });
});
