import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../app';

describe('Auth Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    process.env.ADMIN_SECRET = 'test-secret';
  });

  afterAll(async () => {
    await app.close();
    delete process.env.ADMIN_SECRET;
  });

  it('should return success for valid password', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'test-secret' }
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.payload);
    expect(json.success).toBe(true);
  });

  it('should return 401 for invalid password', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'wrong-password' }
    });

    expect(response.statusCode).toBe(401);
    const json = JSON.parse(response.payload);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Invalid password');
  });

  it('should protect other endpoints when auth is required', async () => {
    // If ADMIN_SECRET is set, any other /api endpoint should return 401 without Bearer token
    const response = await app.inject({
      method: 'GET',
      url: '/api/loadData'
    });

    expect(response.statusCode).toBe(401);
  });

  it('should allow other endpoints if Bearer token matches', async () => {
    // Note: This relies on loadData handling the mock DB. It might return 500 if settings aren't valid
    // but the point here is it doesn't return 401.
    const response = await app.inject({
      method: 'GET',
      url: '/api/loadData',
      headers: {
        authorization: 'Bearer test-secret'
      }
    });

    // As long as it's not 401, authorization worked
    expect(response.statusCode).not.toBe(401);
  });
});
