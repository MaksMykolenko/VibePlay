import { expect, test } from '@playwright/test';
import {
  adminAgent,
  apiLogin,
  authHeaders,
  createInvite,
  registerVerifiedCreator,
  uniq,
  uploadVersion,
} from './helpers.js';
import { E2E } from './stack/env.js';

/**
 * RBAC enforcement (spec §31): every denial below must come from the SERVER,
 * not the UI. Player → admin/creator surfaces, creator → admin surface,
 * creator → another creator's game.
 */
test.describe('RBAC', () => {
  test('player is denied admin routes and creator mutations', async () => {
    const admin = await adminAgent();
    const username = uniq('rbacplayer');
    const email = `${username}@e2e.vibeplay.local`;
    const invite = await createInvite(admin, 'PLAYER', email);
    const { request: pwReq } = await import('@playwright/test');
    const anon = await pwReq.newContext({ baseURL: E2E.apiUrl });
    const reg = await anon.post('/api/auth/register', {
      data: {
        email,
        username,
        displayName: username,
        password: 'player-rbac-pass-1',
        inviteCode: invite,
        acceptTerms: true,
      },
    });
    expect(reg.status(), await reg.text()).toBe(201);
    const player = await apiLogin(email, 'player-rbac-pass-1');

    const adminRoute = await player.ctx.get('/api/admin/moderation');
    expect(adminRoute.status()).toBe(403);

    const creatorMutation = await player.ctx.post('/api/creator/games', {
      headers: authHeaders(player),
      data: {
        title: 'Should not exist',
        shortDescription: 'x',
        description: 'x',
        category: 'Arcade',
      },
    });
    expect(creatorMutation.status()).toBe(403);
  });

  test('creator is denied admin endpoints and foreign games', async () => {
    const admin = await adminAgent();
    const { agent: creatorA } = await registerVerifiedCreator(admin);
    const { agent: creatorB } = await registerVerifiedCreator(admin);

    // Creator → admin endpoint = 403.
    const adminEndpoint = await creatorA.ctx.get('/api/admin/moderation');
    expect(adminEndpoint.status()).toBe(403);
    const invites = await creatorA.ctx.post('/api/admin/invites', {
      headers: authHeaders(creatorA),
      data: { role: 'PLAYER', expiresInDays: 7 },
    });
    expect(invites.status()).toBe(403);

    // Creator A uploads a game; creator B must not see or edit it.
    const upload = await uploadVersion(creatorA, 'hello-vibeplay.zip', uniq('Owned '));
    expect(upload.status).toBe('READY_FOR_REVIEW');

    const foreignRead = await creatorB.ctx.get(`/api/creator/games/${upload.gameId}`);
    expect(foreignRead.status()).toBe(403);

    const foreignEdit = await creatorB.ctx.patch(`/api/creator/games/${upload.gameId}`, {
      headers: authHeaders(creatorB),
      data: { title: 'Hijacked title' },
    });
    expect(foreignEdit.status()).toBe(403);

    const foreignVersion = await creatorB.ctx.post(`/api/creator/games/${upload.gameId}/versions`, {
      headers: authHeaders(creatorB),
      data: { version: '6.6.6' },
    });
    expect(foreignVersion.status()).toBe(403);
  });

  test('role escalation through profile/registration payloads is impossible', async () => {
    const admin = await adminAgent();
    const { agent } = await registerVerifiedCreator(admin);

    // updateProfileSchema is strict: role/email are rejected outright.
    const escalation = await agent.ctx.patch('/api/profile', {
      headers: authHeaders(agent),
      data: { displayName: 'Still Creator', role: 'ADMIN' },
    });
    expect(escalation.status()).toBe(422);

    const me = await agent.ctx.get('/api/auth/me');
    expect((await me.json()).user.role).toBe('CREATOR');
  });
});
