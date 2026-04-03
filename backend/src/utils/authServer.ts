/**
 * Core authorization logic for the Fastify auth plugin.
 * Supports three token types:
 *   1. ADMIN_SECRET (god mode) — raw secret as Bearer token
 *   2. JWT — signed token from user authentication
 *   3. No auth required — when ADMIN_SECRET is unset and auth.method is not configured
 */

import { verifyToken, type JwtPayload } from '../services/userService';
import type { UserRole } from '@valuestream/shared-types';

export interface AuthResult {
  authorized: boolean;
  user?: JwtPayload & { isAdmin: boolean };
  response?: any;
  statusCode?: number;
}

/** Routes that bypass auth entirely */
const PUBLIC_PREFIXES = [
  '/api/auth/login',
  '/api/auth/methods',
  '/api/auth/setup',
  '/api/auth/aws-sso/',
  '/api/health',
];

export function checkAuth(
  url: string | undefined,
  headers: Record<string, string | string[] | undefined>,
  adminSecret: string | undefined
): AuthResult {
  // Only protect /api/ routes
  if (!url?.startsWith('/api/')) {
    return { authorized: true };
  }

  // Extract token from headers (needed for auth status check)
  let token: string | undefined = headers['x-admin-secret'] as string | undefined;
  const authHeader = headers['authorization'] as string | undefined;
  if (!token && authHeader?.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  // Special case: auth status endpoint — must run before public prefix check
  if (url.startsWith('/api/auth/status')) {
    return handleAuthStatus(token, adminSecret);
  }

  // Allow public endpoints through
  for (const prefix of PUBLIC_PREFIXES) {
    if (url.startsWith(prefix)) {
      return { authorized: true };
    }
  }

  const isAuthRequired = !!adminSecret;

  // If no auth required at all, allow everything
  if (!isAuthRequired) {
    return { authorized: true, user: { userId: 'anonymous', username: 'anonymous', role: 'admin' as UserRole, isAdmin: true } };
  }

  if (!token) {
    return { authorized: false, statusCode: 401, response: { success: false, error: 'Unauthorized' } };
  }

  // Check ADMIN_SECRET (god mode)
  if (token === adminSecret) {
    return {
      authorized: true,
      user: { userId: 'admin-secret', username: 'admin', role: 'admin' as UserRole, isAdmin: true }
    };
  }

  // Try JWT
  const jwtPayload = verifyToken(token);
  if (jwtPayload) {
    return {
      authorized: true,
      user: { ...jwtPayload, isAdmin: jwtPayload.role === 'admin' }
    };
  }

  return { authorized: false, statusCode: 401, response: { success: false, error: 'Unauthorized' } };
}

function handleAuthStatus(
  token: string | undefined,
  adminSecret: string | undefined
): AuthResult {
  const isAuthRequired = !!adminSecret;

  let authenticated = !isAuthRequired;
  let user: AuthResult['user'] | undefined;

  if (isAuthRequired && token) {
    if (token === adminSecret) {
      authenticated = true;
      user = { userId: 'admin-secret', username: 'admin', role: 'admin' as UserRole, isAdmin: true };
    } else {
      const jwtPayload = verifyToken(token);
      if (jwtPayload) {
        authenticated = true;
        user = { ...jwtPayload, isAdmin: jwtPayload.role === 'admin' };
      }
    }
  }

  return {
    authorized: true,
    statusCode: authenticated ? 200 : 401,
    response: {
      required: isAuthRequired,
      authenticated,
      ...(user ? { user: { username: user.username, role: user.role } } : {}),
    }
  };
}
