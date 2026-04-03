import { FastifyPluginAsync } from 'fastify';
import { Client } from 'ldapts';
import { Type, Static } from '@sinclair/typebox';
import { getDb } from '../utils/mongoServer';
import { augmentConfig } from '../utils/configHelpers';
import { AppError } from '../utils/errors';
import {
  findUserByUsername, createUser, upsertExternalUser,
  verifyPassword, signToken, updateLastLogin,
  listUsers, updateUserRole, deleteUser, getUserCount
} from '../services/userService';
import type { AuthMethod, UserRole } from '@valuestream/shared-types';

// ── Schemas ─────────────────────────────────────────────────────

const LoginBody = Type.Object({
  password: Type.Optional(Type.String()),
  username: Type.Optional(Type.String()),
});
type LoginBodyType = Static<typeof LoginBody>;

const SetupBody = Type.Object({
  username: Type.String(),
  password: Type.String(),
  display_name: Type.String(),
});
type SetupBodyType = Static<typeof SetupBody>;

const UpdateRoleBody = Type.Object({
  role: Type.Union([Type.Literal('admin'), Type.Literal('editor'), Type.Literal('viewer')]),
});
type UpdateRoleBodyType = Static<typeof UpdateRoleBody>;

// ── Helpers ─────────────────────────────────────────────────────

async function getAppDb(fastify: any) {
  const settings = await fastify.getSettings();
  if (!settings.persistence?.mongo?.app?.uri) {
    throw new AppError('App database is not configured.', 500);
  }
  return getDb(augmentConfig(settings, 'app'), 'app', true);
}

function getSessionExpiry(settings: any): number {
  return settings.auth?.session_expiry_hours || 24;
}

function getDefaultRole(settings: any): UserRole {
  return settings.auth?.default_role || 'viewer';
}

function getAuthMethod(settings: any): AuthMethod {
  return settings.auth?.method || 'local';
}

// ── Routes ──────────────────────────────────────────────────────

export const authRoutes: FastifyPluginAsync = async (fastify) => {

  /** Returns the configured auth method so the login page can adapt */
  fastify.get('/api/auth/methods', async (_request, reply) => {
    const settings = await fastify.getSettings();
    return reply.send({
      method: getAuthMethod(settings),
      // For aws-sso, include whether it's configured
      aws_sso_configured: !!(settings.auth?.aws_sso?.start_url),
    });
  });

  /**
   * POST /api/auth/login
   * Handles login for all three methods:
   *   - local:   { username, password }
   *   - ldap:    { username, password }  (binds against LDAP)
   *   - aws-sso: handled via separate device flow endpoints
   * Also supports legacy ADMIN_SECRET: { password }
   */
  fastify.post<{ Body: LoginBodyType }>('/api/auth/login', { schema: { body: LoginBody } }, async (request, reply) => {
    const { username, password } = request.body;
    const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.VITE_ADMIN_SECRET;

    // Legacy ADMIN_SECRET login (god mode) — password only, no username
    if (!username && password) {
      if (password === ADMIN_SECRET) {
        return reply.send({ success: true, token: password });
      }
      throw new AppError('Invalid password', 401);
    }

    if (!username || !password) {
      throw new AppError('Username and password are required', 400);
    }

    const settings = await fastify.getSettings();
    const method = getAuthMethod(settings);
    const expiry = getSessionExpiry(settings);

    let db;
    try {
      db = await getAppDb(fastify);
    } catch {
      // No DB configured — fall back to ADMIN_SECRET only
      throw new AppError('User database not configured. Use admin password.', 503);
    }

    if (method === 'local') {
      return handleLocalLogin(db, username, password, expiry, reply);
    }

    if (method === 'ldap') {
      return handleLdapLogin(db, settings, username, password, expiry, getDefaultRole(settings), reply);
    }

    throw new AppError(`Auth method '${method}' does not support username/password login`, 400);
  });

  /**
   * POST /api/auth/setup
   * Create the first admin user (only works when no users exist).
   * Requires ADMIN_SECRET as Bearer token.
   */
  fastify.post<{ Body: SetupBodyType }>('/api/auth/setup', { schema: { body: SetupBody } }, async (request, reply) => {
    const db = await getAppDb(fastify);
    const count = await getUserCount(db);

    if (count > 0) {
      throw new AppError('Setup already completed. Users exist.', 409);
    }

    // Require ADMIN_SECRET to bootstrap
    const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.VITE_ADMIN_SECRET;
    const token = (request.headers.authorization as string)?.substring(7);
    if (ADMIN_SECRET && token !== ADMIN_SECRET) {
      throw new AppError('ADMIN_SECRET required for initial setup', 401);
    }

    const { username, password, display_name } = request.body;
    const user = await createUser(db, username, display_name, 'admin', 'local', password);

    const settings = await fastify.getSettings();
    const jwt = signToken(
      { userId: user.id, username: user.username, role: user.role },
      getSessionExpiry(settings)
    );

    return reply.send({ success: true, token: jwt, user: { username: user.username, role: user.role, display_name: user.display_name } });
  });

  // ── User Management (admin only) ─────────────────────────────

  fastify.get('/api/auth/users', async (request, reply) => {
    if (!request.authUser?.isAdmin) throw new AppError('Admin access required', 403);
    const db = await getAppDb(fastify);
    const users = await listUsers(db);
    return reply.send({ success: true, users });
  });

  fastify.put<{ Params: { id: string }; Body: UpdateRoleBodyType }>(
    '/api/auth/users/:id/role',
    { schema: { body: UpdateRoleBody } },
    async (request, reply) => {
      if (!request.authUser?.isAdmin) throw new AppError('Admin access required', 403);
      const db = await getAppDb(fastify);
      await updateUserRole(db, request.params.id, request.body.role);
      return reply.send({ success: true });
    }
  );

  fastify.delete<{ Params: { id: string } }>('/api/auth/users/:id', async (request, reply) => {
    if (!request.authUser?.isAdmin) throw new AppError('Admin access required', 403);
    if (request.authUser.userId === request.params.id) {
      throw new AppError('Cannot delete yourself', 400);
    }
    const db = await getAppDb(fastify);
    await deleteUser(db, request.params.id);
    return reply.send({ success: true });
  });
};

// ── Login Handlers ──────────────────────────────────────────────

async function handleLocalLogin(db: any, username: string, password: string, expiry: number, reply: any) {
  const user = await findUserByUsername(db, username);
  if (!user || !user.password_hash) {
    throw new AppError('Invalid username or password', 401);
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    throw new AppError('Invalid username or password', 401);
  }

  await updateLastLogin(db, username);

  const token = signToken({ userId: user.id, username: user.username, role: user.role }, expiry);
  return reply.send({
    success: true,
    token,
    user: { username: user.username, role: user.role, display_name: user.display_name }
  });
}

async function handleLdapLogin(db: any, settings: any, username: string, password: string, expiry: number, defaultRole: UserRole, reply: any) {
  const ldap = settings.ldap;
  if (!ldap?.url) throw new AppError('LDAP is not configured', 500);

  // Construct the user DN for bind. Common patterns:
  // - uid=username,ou=users,dc=example,dc=com
  // - cn=username,ou=users,dc=example,dc=com
  // Use the team base_dn as a hint for the user search base
  const baseDn = ldap.team?.base_dn || '';
  // Try to extract the users OU from the base DN (replace team-specific part)
  const userBaseDn = baseDn.replace(/^ou=teams/i, 'ou=users') || baseDn;

  const client = new Client({ url: ldap.url });

  try {
    // First bind with service account to find the user
    if (ldap.bind_dn) {
      await client.bind(ldap.bind_dn, ldap.bind_password || '');
    }

    // Search for the user by username
    const { searchEntries } = await client.search(userBaseDn, {
      filter: `(|(uid=${username})(sAMAccountName=${username})(cn=${username}))`,
      attributes: ['dn', 'cn', 'displayName', 'uid', 'sAMAccountName'],
      scope: 'sub',
    });

    if (searchEntries.length === 0) {
      throw new AppError('Invalid username or password', 401);
    }

    const userEntry = searchEntries[0];
    const userDn = userEntry.dn;
    const displayName = (userEntry.displayName || userEntry.cn || username) as string;

    // Unbind service account
    await client.unbind();

    // Re-bind as the user to verify password
    const userClient = new Client({ url: ldap.url });
    try {
      await userClient.bind(userDn, password);
    } catch {
      throw new AppError('Invalid username or password', 401);
    } finally {
      await userClient.unbind();
    }

    // Auth succeeded — upsert user in local DB
    const user = await upsertExternalUser(db, username, displayName, 'ldap', defaultRole);

    const token = signToken({ userId: user.id, username: user.username, role: user.role }, expiry);
    return reply.send({
      success: true,
      token,
      user: { username: user.username, role: user.role, display_name: user.display_name }
    });
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError('LDAP authentication failed', 401);
  } finally {
    try { await client.unbind(); } catch { /* already unbound */ }
  }
}
