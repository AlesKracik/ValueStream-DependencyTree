import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../app';

describe('Auth Routes', () => {
  let app: FastifyInstance;
  // In-memory settings so the admin-password lockout state is deterministic and
  // doesn't touch the filesystem or leak between tests.
  let settingsStore: any;

  beforeAll(async () => {
    app = await buildApp();
    process.env.ADMIN_SECRET = 'test-secret';
  });

  afterAll(async () => {
    await app.close();
    delete process.env.ADMIN_SECRET;
  });

  beforeEach(() => {
    settingsStore = {
      auth: { method: 'local', session_expiry_hours: 24, default_role: 'viewer' },
      persistence: {},
    };
    app.getSettings = vi.fn(async () => settingsStore);
    app.saveSettings = vi.fn(async (s: any) => { settingsStore = s; });
  });

  const tryPassword = (password: string) =>
    app.inject({ method: 'POST', url: '/api/auth/login', payload: { password } });

  it('should return success for valid password', async () => {
    const response = await tryPassword('test-secret');
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload).success).toBe(true);
  });

  it('should return 401 with attempts-remaining message for invalid password', async () => {
    const response = await tryPassword('wrong-password');
    expect(response.statusCode).toBe(401);
    const json = JSON.parse(response.payload);
    expect(json.success).toBe(false);
    expect(json.error).toContain('Invalid password');
    expect(json.error).toContain('2 attempts remaining');
    expect(settingsStore.auth.admin_password_attempts).toBe(1);
  });

  it('should protect other endpoints when auth is required', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/loadData' });
    expect(response.statusCode).toBe(401);
  });

  it('should allow other endpoints if Bearer token matches', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/loadData',
      headers: { authorization: 'Bearer test-secret' },
    });
    expect(response.statusCode).not.toBe(401);
  });

  describe('admin password lockout', () => {
    it('locks after 3 failed attempts and refuses all further logins with 423', async () => {
      const r1 = await tryPassword('nope');
      expect(r1.statusCode).toBe(401);
      expect(JSON.parse(r1.payload).error).toContain('2 attempts remaining');

      const r2 = await tryPassword('nope');
      expect(r2.statusCode).toBe(401);
      expect(JSON.parse(r2.payload).error).toContain('1 attempt remaining');

      const r3 = await tryPassword('nope');
      expect(r3.statusCode).toBe(423);
      expect(settingsStore.auth.admin_password_locked).toBe(true);

      // Even the correct password is refused once locked.
      const correct = await tryPassword('test-secret');
      expect(correct.statusCode).toBe(423);
    });

    it('clears the failed-attempt counter on a successful login before lockout', async () => {
      await tryPassword('nope');
      expect(settingsStore.auth.admin_password_attempts).toBe(1);

      const ok = await tryPassword('test-secret');
      expect(ok.statusCode).toBe(200);
      expect(settingsStore.auth.admin_password_attempts).toBe(0);
    });

    it('reset endpoint requires an authenticated admin', async () => {
      const noauth = await app.inject({ method: 'POST', url: '/api/auth/admin-lock/reset' });
      expect(noauth.statusCode).toBe(401);
    });

    it('reset endpoint unlocks and clears the counter for an admin', async () => {
      settingsStore.auth.admin_password_locked = true;
      settingsStore.auth.admin_password_attempts = 3;

      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/admin-lock/reset',
        headers: { authorization: 'Bearer test-secret' },
      });
      expect(res.statusCode).toBe(200);
      expect(settingsStore.auth.admin_password_locked).toBe(false);
      expect(settingsStore.auth.admin_password_attempts).toBe(0);

      // Admin password login works again after the reset.
      const ok = await tryPassword('test-secret');
      expect(ok.statusCode).toBe(200);
    });
  });
});
