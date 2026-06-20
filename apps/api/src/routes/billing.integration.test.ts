import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@vibeplay/database';
import type { Stripe } from '../lib/stripe.js';
import type { StripeGateway } from '../lib/stripe.js';
import {
  authed,
  buildTestApp,
  createUser,
  loginAs,
  resetDb,
  type AuthedAgent,
} from '../test/helpers.js';

function stripeObject<T>(value: unknown): T {
  return value as T;
}

describe('Creator Plus billing', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let creator: Awaited<ReturnType<typeof createUser>>;
  let admin: Awaited<ReturnType<typeof createUser>>;
  let creatorAgent: AuthedAgent;
  let adminAgent: AuthedAgent;
  let nextEvent: Stripe.Event | null = null;
  const checkoutCalls: Stripe.Checkout.SessionCreateParams[] = [];
  const portalCalls: Stripe.BillingPortal.SessionCreateParams[] = [];

  const stripe: StripeGateway = {
    async createCustomer(params) {
      return stripeObject<Stripe.Customer>({ id: 'cus_creator', ...params });
    },
    async createCheckoutSession(params) {
      checkoutCalls.push(params);
      return stripeObject<Stripe.Checkout.Session>({
        id: 'cs_creator_plus',
        url: 'https://checkout.stripe.test/session',
      });
    },
    async createPortalSession(params) {
      portalCalls.push(params);
      return stripeObject<Stripe.BillingPortal.Session>({
        id: 'bps_creator_plus',
        url: 'https://billing.stripe.test/session',
      });
    },
    constructWebhookEvent(_payload, signature) {
      if (signature !== 'valid_signature' || !nextEvent) throw new Error('invalid signature');
      return nextEvent;
    },
  };

  beforeAll(async () => {
    const context = await buildTestApp({}, async () => {}, { stripe });
    app = context.app;
    prisma = context.prisma;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    nextEvent = null;
    checkoutCalls.length = 0;
    portalCalls.length = 0;
    [creator, admin] = await Promise.all([
      createUser(prisma, app.env, {
        email: 'plus-creator@example.com',
        username: 'plus_creator',
        role: 'CREATOR',
      }),
      createUser(prisma, app.env, {
        email: 'plus-admin@example.com',
        username: 'plus_admin',
        role: 'ADMIN',
      }),
    ]);
    [creatorAgent, adminAgent] = await Promise.all([
      loginAs(app, creator.email),
      loginAs(app, admin.email),
    ]);
  });

  function checkoutEvent(userId: string, customerId = 'cus_webhook'): Stripe.Event {
    return stripeObject<Stripe.Event>({
      id: `evt_checkout_${userId}`,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_completed',
          object: 'checkout.session',
          client_reference_id: userId,
          customer: customerId,
          metadata: { userId },
        },
      },
    });
  }

  function subscriptionEvent(
    id: string,
    type:
      | 'customer.subscription.created'
      | 'customer.subscription.updated'
      | 'customer.subscription.deleted',
    status: Stripe.Subscription.Status,
    userId = creator.id,
  ): Stripe.Event {
    const now = Math.floor(Date.now() / 1000);
    return stripeObject<Stripe.Event>({
      id,
      type,
      data: {
        object: {
          id: 'sub_creator_plus',
          object: 'subscription',
          customer: 'cus_creator',
          status,
          metadata: { userId, plan: 'CREATOR_PLUS' },
          cancel_at_period_end: false,
          items: {
            data: [
              {
                price: { id: app.env.STRIPE_CREATOR_PLUS_PRICE_ID },
                current_period_start: now,
                current_period_end: now + 30 * 24 * 60 * 60,
              },
            ],
          },
        },
      },
    });
  }

  async function sendWebhook(event: Stripe.Event, signature = 'valid_signature') {
    nextEvent = event;
    return app.inject({
      method: 'POST',
      url: '/api/webhooks/stripe',
      headers: { 'content-type': 'application/json', 'stripe-signature': signature },
      payload: JSON.stringify({ id: event.id }),
    });
  }

  async function createPublishedGame(ownerId = creator.id, suffix = 'one') {
    return prisma.game.create({
      data: {
        creatorId: ownerId,
        slug: `billing-published-${suffix}-${Date.now()}`,
        title: `Published ${suffix}`,
        shortDescription: 'Published game used for creator plan limit tests.',
        description: 'This game remains available regardless of later billing status changes.',
        category: 'Arcade',
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
  }

  async function createReadyGame(suffix: string) {
    const game = await prisma.game.create({
      data: {
        creatorId: creator.id,
        slug: `billing-ready-${suffix}-${Date.now()}`,
        title: `Ready ${suffix}`,
        shortDescription: 'Ready game used for creator plan limit tests.',
        description: 'This game has passed validation and is waiting for a moderation decision.',
        category: 'Arcade',
      },
    });
    const version = await prisma.gameVersion.create({
      data: {
        gameId: game.id,
        version: '1.0.0',
        status: 'READY_FOR_REVIEW',
        publishedObjectPrefix: `games/${game.id}/ready/`,
      },
    });
    return { game, version };
  }

  it('requires authentication for checkout and portal', async () => {
    const checkout = await app.inject({
      method: 'POST',
      url: '/api/billing/checkout',
      payload: {},
    });
    const portal = await app.inject({ method: 'POST', url: '/api/billing/portal', payload: {} });
    expect(checkout.statusCode).toBe(401);
    expect(portal.statusCode).toBe(401);
  });

  it('creates Stripe Checkout with the configured recurring price and links the customer', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/billing/checkout',
      ...authed(creatorAgent),
      payload: {},
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().url).toBe('https://checkout.stripe.test/session');
    expect(checkoutCalls).toHaveLength(1);
    expect(checkoutCalls[0]).toMatchObject({
      mode: 'subscription',
      client_reference_id: creator.id,
      line_items: [{ price: app.env.STRIPE_CREATOR_PLUS_PRICE_ID, quantity: 1 }],
      success_url: 'http://localhost:5173/settings/billing?success=1',
      cancel_url: 'http://localhost:5173/settings/billing?canceled=1',
    });
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: creator.id } })).stripeCustomerId,
    ).toBe('cus_creator');
  });

  it('creates an authenticated Stripe Billing Portal session for an existing customer', async () => {
    await prisma.user.update({
      where: { id: creator.id },
      data: { stripeCustomerId: 'cus_portal' },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/billing/portal',
      ...authed(creatorAgent),
      payload: {},
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().url).toBe('https://billing.stripe.test/session');
    expect(portalCalls[0]).toEqual({
      customer: 'cus_portal',
      return_url: 'http://localhost:5173/settings/billing',
    });
  });

  it('rejects invalid webhook signatures', async () => {
    const response = await sendWebhook(checkoutEvent(creator.id), 'invalid_signature');
    expect(response.statusCode).toBe(400);
    expect(await prisma.stripeWebhookEvent.count()).toBe(0);
  });

  it('links checkout customers to users and processes each event id once', async () => {
    const event = checkoutEvent(creator.id);
    expect((await sendWebhook(event)).statusCode).toBe(204);
    expect((await sendWebhook(event)).statusCode).toBe(204);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: creator.id } })).stripeCustomerId,
    ).toBe('cus_webhook');
    expect(await prisma.stripeWebhookEvent.count({ where: { id: event.id } })).toBe(1);
  });

  it('activates Creator Plus from subscription.updated and exposes billing status and badge', async () => {
    const event = subscriptionEvent(
      'evt_subscription_active',
      'customer.subscription.updated',
      'active',
    );
    expect((await sendWebhook(event)).statusCode).toBe(204);

    const billing = await app.inject({
      method: 'GET',
      url: '/api/billing/me',
      ...authed(creatorAgent),
    });
    expect(billing.statusCode, billing.body).toBe(200);
    expect(billing.json()).toMatchObject({
      plan: 'CREATOR_PLUS',
      status: 'active',
      entitlements: { maxPublishedGames: 10, maxGameVersionsPerGame: 50 },
    });

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', ...authed(creatorAgent) });
    expect(me.statusCode, me.body).toBe(200);
    expect(me.json().user.creatorPlus).toBe(true);

    const game = await createPublishedGame();
    const detail = await app.inject({ method: 'GET', url: `/api/games/${game.slug}` });
    expect(detail.statusCode, detail.body).toBe(200);
    expect(detail.json().game.creator.creatorPlus).toBe(true);
  });

  it('marks deleted subscriptions canceled without unpublishing existing games', async () => {
    const game = await createPublishedGame();
    await sendWebhook(
      subscriptionEvent('evt_active_first', 'customer.subscription.updated', 'active'),
    );
    const deleted = subscriptionEvent(
      'evt_subscription_deleted',
      'customer.subscription.deleted',
      'canceled',
    );
    expect((await sendWebhook(deleted)).statusCode).toBe(204);

    const billing = await app.inject({
      method: 'GET',
      url: '/api/billing/me',
      ...authed(creatorAgent),
    });
    expect(billing.json()).toMatchObject({ plan: 'FREE', status: 'canceled' });
    expect((await prisma.game.findUniqueOrThrow({ where: { id: game.id } })).status).toBe(
      'PUBLISHED',
    );
  });

  it('prevents a free creator from publishing beyond the free game limit', async () => {
    await createPublishedGame();
    const { game, version } = await createReadyGame('free-second');
    const response = await app.inject({
      method: 'POST',
      url: `/api/admin/game-versions/${version.id}/approve`,
      ...authed(adminAgent),
      payload: {},
    });
    expect(response.statusCode, response.body).toBe(409);
    expect(response.json().error.code).toBe('PLAN_LIMIT_REACHED');
    expect((await prisma.game.findUniqueOrThrow({ where: { id: game.id } })).status).toBe('DRAFT');
  });

  it('allows Creator Plus to publish beyond the free limit', async () => {
    await sendWebhook(
      subscriptionEvent('evt_plus_publish', 'customer.subscription.updated', 'active'),
    );
    await createPublishedGame();
    const { game, version } = await createReadyGame('plus-second');
    const queue = await app.inject({
      method: 'GET',
      url: '/api/admin/moderation',
      ...authed(adminAgent),
    });
    expect(
      queue
        .json()
        .queue.find((entry: { version: { id: string } }) => entry.version.id === version.id)
        .priority,
    ).toBe(true);
    const response = await app.inject({
      method: 'POST',
      url: `/api/admin/game-versions/${version.id}/approve`,
      ...authed(adminAgent),
      payload: {},
    });
    expect(response.statusCode, response.body).toBe(204);
    expect((await prisma.game.findUniqueOrThrow({ where: { id: game.id } })).status).toBe(
      'PUBLISHED',
    );
  });

  it('returns Free billing defaults when no subscription exists', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/billing/me',
      ...authed(creatorAgent),
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      plan: 'FREE',
      status: null,
      entitlements: { maxPublishedGames: 1, maxUploadBytes: 50 * 1024 * 1024 },
    });
  });

  it('enforces 50 MB Free uploads and allows 100 MB infrastructure-safe Plus uploads', async () => {
    const game = await prisma.game.create({
      data: {
        creatorId: creator.id,
        slug: `billing-upload-${Date.now()}`,
        title: 'Billing Upload',
        shortDescription: 'Upload entitlement test game for creator billing.',
        description: 'This game verifies that plan limits do not bypass the validation pipeline.',
        category: 'Arcade',
      },
    });
    const version = await prisma.gameVersion.create({
      data: { gameId: game.id, version: '1.0.0', status: 'UPLOADING' },
    });
    const payload = {
      versionId: version.id,
      fileName: 'large-game.zip',
      fileSize: 60 * 1024 * 1024,
      contentType: 'application/zip',
      sha256: 'a'.repeat(64),
    };
    const free = await app.inject({
      method: 'POST',
      url: `/api/creator/games/${game.id}/upload-intent`,
      ...authed(creatorAgent),
      payload,
    });
    expect(free.statusCode, free.body).toBe(409);
    expect(free.json().error.code).toBe('PLAN_LIMIT_REACHED');

    await sendWebhook(
      subscriptionEvent('evt_plus_upload', 'customer.subscription.updated', 'active'),
    );
    const plus = await app.inject({
      method: 'POST',
      url: `/api/creator/games/${game.id}/upload-intent`,
      ...authed(creatorAgent),
      payload,
    });
    expect(plus.statusCode, plus.body).toBe(200);
    expect(plus.json().maxBytes).toBe(100 * 1024 * 1024);
  });

  it('enforces 10 Free versions and allows a larger Plus version history', async () => {
    const game = await prisma.game.create({
      data: {
        creatorId: creator.id,
        slug: `billing-versions-${Date.now()}`,
        title: 'Billing Versions',
        shortDescription: 'Version entitlement test game for creator billing.',
        description: 'Archived versions remain intact while new version creation follows the plan.',
        category: 'Arcade',
      },
    });
    await prisma.gameVersion.createMany({
      data: Array.from({ length: 10 }, (_, index) => ({
        gameId: game.id,
        version: `1.0.${index}`,
        status: 'ARCHIVED' as const,
      })),
    });
    const free = await app.inject({
      method: 'POST',
      url: `/api/creator/games/${game.id}/versions`,
      ...authed(creatorAgent),
      payload: { version: '2.0.0' },
    });
    expect(free.statusCode, free.body).toBe(409);
    expect(free.json().error.code).toBe('PLAN_LIMIT_REACHED');

    await sendWebhook(
      subscriptionEvent('evt_plus_versions', 'customer.subscription.updated', 'active'),
    );
    const plus = await app.inject({
      method: 'POST',
      url: `/api/creator/games/${game.id}/versions`,
      ...authed(creatorAgent),
      payload: { version: '2.0.0' },
    });
    expect(plus.statusCode, plus.body).toBe(200);
  });
});
