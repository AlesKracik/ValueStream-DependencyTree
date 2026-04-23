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

  it('should enrich TypeError: fetch failed with cause details (ECONNREFUSED)', async () => {
    const fetchApp = Fastify({ logger: false });
    await fetchApp.register(errorHandlerPlugin);

    fetchApp.get('/test/fetch-refused', async () => {
      const err = new TypeError('fetch failed');
      (err as Error & { cause?: unknown }).cause = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:4321'), {
        code: 'ECONNREFUSED',
        address: '127.0.0.1',
        port: 4321,
        syscall: 'connect',
      });
      throw err;
    });
    await fetchApp.ready();

    const response = await fetchApp.inject({ method: 'GET', url: '/test/fetch-refused' });
    expect(response.statusCode).toBe(500);
    const json = JSON.parse(response.payload);
    expect(json.success).toBe(false);
    expect(json.error).toContain('ECONNREFUSED');
    expect(json.error).toContain('127.0.0.1:4321');
    expect(json.error).toContain('GET /test/fetch-refused');

    await fetchApp.close();
  });

  it('should enrich TypeError: fetch failed with hostname on DNS failure (ENOTFOUND)', async () => {
    const fetchApp = Fastify({ logger: false });
    await fetchApp.register(errorHandlerPlugin);

    fetchApp.get('/test/fetch-dns', async () => {
      const err = new TypeError('fetch failed');
      (err as Error & { cause?: unknown }).cause = Object.assign(new Error('getaddrinfo ENOTFOUND does-not-exist.invalid'), {
        code: 'ENOTFOUND',
        hostname: 'does-not-exist.invalid',
        syscall: 'getaddrinfo',
      });
      throw err;
    });
    await fetchApp.ready();

    const response = await fetchApp.inject({ method: 'GET', url: '/test/fetch-dns' });
    const json = JSON.parse(response.payload);
    expect(json.error).toContain('ENOTFOUND');
    expect(json.error).toContain('does-not-exist.invalid');

    await fetchApp.close();
  });

  it('should unwrap nested cause (undici ConnectTimeoutError)', async () => {
    const fetchApp = Fastify({ logger: false });
    await fetchApp.register(errorHandlerPlugin);

    fetchApp.get('/test/fetch-timeout', async () => {
      const err = new TypeError('fetch failed');
      // Simulate undici wrapping the real cause one level deeper.
      const inner = Object.assign(new Error('Connect Timeout Error'), {
        code: 'UND_ERR_CONNECT_TIMEOUT',
        hostname: 'slow.example.com',
        port: 443,
      });
      (err as Error & { cause?: unknown }).cause = { cause: inner };
      throw err;
    });
    await fetchApp.ready();

    const response = await fetchApp.inject({ method: 'GET', url: '/test/fetch-timeout' });
    const json = JSON.parse(response.payload);
    expect(json.error).toContain('UND_ERR_CONNECT_TIMEOUT');
    expect(json.error).toContain('slow.example.com:443');

    await fetchApp.close();
  });

  it('should fall back to generic message when fetch error has no cause', async () => {
    const fetchApp = Fastify({ logger: false });
    await fetchApp.register(errorHandlerPlugin);

    fetchApp.get('/test/fetch-bare', async () => {
      throw new TypeError('fetch failed');
    });
    await fetchApp.ready();

    const response = await fetchApp.inject({ method: 'GET', url: '/test/fetch-bare' });
    const json = JSON.parse(response.payload);
    expect(json.error).toContain('Outbound request failed');
    expect(json.error).toContain('GET /test/fetch-bare');
    expect(json.error).not.toBe('fetch failed');

    await fetchApp.close();
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
