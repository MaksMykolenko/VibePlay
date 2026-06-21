import type { FastifyRequest } from 'fastify';
import type { User, UserRole } from '@vibeplay/database';
import { errors } from '@vibeplay/shared';

/**
 * RBAC guards (spec §11). The backend is the single source of truth;
 * frontend role checks are UX only.
 */

export function requireAuth(req: FastifyRequest): User {
  const user = req.currentUser;
  if (!user) throw errors.unauthorized();
  return user;
}

export function requireActiveUser(req: FastifyRequest): User {
  const user = requireAuth(req);
  if (user.status === 'SUSPENDED') throw errors.accountSuspended();
  if (user.status === 'BANNED') throw errors.accountBanned();
  if (user.status === 'DELETED') throw errors.unauthorized('Account no longer exists');
  return user;
}

export function requireVerifiedEmail(req: FastifyRequest): User {
  const user = requireActiveUser(req);
  if (user.role !== 'ADMIN' && user.role !== 'OWNER' && !user.emailVerifiedAt) {
    throw errors.emailNotVerified();
  }
  return user;
}

// OWNER is the highest privilege tier — a strict superset of ADMIN.
const ROLE_ORDER: Record<UserRole, number> = { PLAYER: 0, CREATOR: 1, ADMIN: 2, OWNER: 3 };

export function canManageRole(actorRole: UserRole, targetRole: UserRole): boolean {
  return ROLE_ORDER[actorRole] > ROLE_ORDER[targetRole];
}

export function requireRole(req: FastifyRequest, role: UserRole): User {
  const user = requireActiveUser(req);
  if (ROLE_ORDER[user.role] < ROLE_ORDER[role]) {
    throw errors.forbidden(`${role} role required`);
  }
  return user;
}

export function requireCreator(req: FastifyRequest): User {
  return requireRole(req, 'CREATOR');
}

export function requireAdmin(req: FastifyRequest): User {
  return requireRole(req, 'ADMIN');
}

/** Owner of the resource — or an admin. Prevents IDOR on creator resources. */
export function requireOwnershipOrAdmin(req: FastifyRequest, ownerId: string): User {
  const user = requireActiveUser(req);
  if (user.id !== ownerId && user.role !== 'ADMIN' && user.role !== 'OWNER') {
    throw errors.forbidden('You do not own this resource');
  }
  return user;
}
