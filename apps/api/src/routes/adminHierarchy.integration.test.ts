import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@vibeplay/database';
import {
  authed,
  buildTestApp,
  createUser,
  loginAs,
  resetDb,
  type AuthedAgent,
} from '../test/helpers.js';

describe('admin user hierarchy', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let admin: Awaited<ReturnType<typeof createUser>>;
  let otherAdmin: Awaited<ReturnType<typeof createUser>>;
  let owner: Awaited<ReturnType<typeof createUser>>;
  let player: Awaited<ReturnType<typeof createUser>>;
  let adminAgent: AuthedAgent;
  let ownerAgent: AuthedAgent;

  beforeAll(async () => {
    const ctx = await buildTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
  });

  afterAll(async () => app.close());

  beforeEach(async () => {
    await resetDb(prisma);
    [admin, otherAdmin, owner, player] = await Promise.all([
      createUser(prisma, app.env, {
        email: 'admin@example.com',
        username: 'admin_one',
        role: 'ADMIN',
      }),
      createUser(prisma, app.env, {
        email: 'admin2@example.com',
        username: 'admin_two',
        role: 'ADMIN',
      }),
      createUser(prisma, app.env, {
        email: 'owner@example.com',
        username: 'owner_one',
        role: 'OWNER',
      }),
      createUser(prisma, app.env, {
        email: 'player@example.com',
        username: 'player_one',
      }),
    ]);
    [adminAgent, ownerAgent] = await Promise.all([
      loginAs(app, admin.email),
      loginAs(app, owner.email),
    ]);
  });

  it('prevents ADMIN from acting on ADMIN or OWNER accounts', async () => {
    for (const target of [otherAdmin, owner]) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/users/${target.id}/suspend`,
        payload: { reason: 'Hierarchy test' },
        ...authed(adminAgent),
      });
      expect(response.statusCode).toBe(403);
      expect((await prisma.user.findUnique({ where: { id: target.id } }))?.status).toBe('ACTIVE');
    }
  });

  it('prevents promotion endpoint from demoting privileged accounts', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/admin/users/${otherAdmin.id}/promote-creator`,
      ...authed(ownerAgent),
    });

    expect(response.statusCode).toBe(409);
    expect((await prisma.user.findUnique({ where: { id: otherAdmin.id } }))?.role).toBe('ADMIN');
  });

  it('protects the last OWNER from self-demotion or status changes', async () => {
    const promote = await app.inject({
      method: 'POST',
      url: `/api/admin/users/${owner.id}/promote-creator`,
      ...authed(ownerAgent),
    });
    const ban = await app.inject({
      method: 'POST',
      url: `/api/admin/users/${owner.id}/ban`,
      payload: { reason: 'Must remain owner' },
      ...authed(ownerAgent),
    });

    expect(promote.statusCode).toBe(403);
    expect(ban.statusCode).toBe(403);
    expect(await prisma.user.count({ where: { role: 'OWNER', status: 'ACTIVE' } })).toBe(1);
  });

  it('allows OWNER to manage ADMIN and audits the action', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/admin/users/${admin.id}/suspend`,
      payload: { reason: 'Owner moderation' },
      ...authed(ownerAgent),
    });

    expect(response.statusCode).toBe(204);
    expect((await prisma.user.findUnique({ where: { id: admin.id } }))?.status).toBe('SUSPENDED');
    expect(
      await prisma.auditLog.count({
        where: { actorId: owner.id, targetId: admin.id, action: 'user.suspend' },
      }),
    ).toBe(1);
  });

  it('allows ADMIN to promote a PLAYER without granting ADMIN', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/admin/users/${player.id}/promote-creator`,
      ...authed(adminAgent),
    });

    expect(response.statusCode).toBe(204);
    expect((await prisma.user.findUnique({ where: { id: player.id } }))?.role).toBe('CREATOR');
  });
});
