import type { FastifyRequest } from 'fastify';
import type { PrismaClient } from '@vibeplay/database';
import { hashIp } from './crypto.js';

/**
 * Append-only audit log. The application exposes NO update/delete path for
 * AuditLog rows — this module is intentionally the only writer.
 */
export async function audit(
  prisma: PrismaClient,
  entry: {
    actorId: string | null;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
    req?: FastifyRequest;
    secret?: string;
  },
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      metadata: (entry.metadata ?? {}) as object,
      ipHash: entry.req && entry.secret ? hashIp(entry.req.ip, entry.secret) : null,
    },
  });
}
