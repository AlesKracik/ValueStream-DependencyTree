import { FastifyRequest } from 'fastify';
import type { UserRole } from '@valuestream/shared-types';
import { AppError } from './errors';

/** Role hierarchy: admin > editor > viewer */
const ROLE_LEVEL: Record<UserRole, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
};

/** Throws 403 if the authenticated user doesn't have at least the required role */
export function requireRole(request: FastifyRequest, minRole: UserRole): void {
  const user = request.authUser;
  // If no user on request, auth plugin already handled it (ADMIN_SECRET god mode or no-auth mode)
  if (!user) return;
  if (ROLE_LEVEL[user.role] < ROLE_LEVEL[minRole]) {
    throw new AppError(`Requires ${minRole} role`, 403);
  }
}
