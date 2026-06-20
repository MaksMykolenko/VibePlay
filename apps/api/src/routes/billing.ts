import type { FastifyInstance } from 'fastify';
import type { SubscriptionStatus } from '@vibeplay/database';
import { ApiError, errors } from '@vibeplay/shared';
import { getUserPlan } from '../lib/entitlements.js';
import { requireActiveUser, requireCreator, requireVerifiedEmail } from '../lib/guards.js';
import { rlPolicy } from '../lib/rateLimit.js';
import type { Stripe } from '../lib/stripe.js';

function stripeId(value: { id: string } | string | null): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

const STATUS_TO_DB: Record<Stripe.Subscription.Status, SubscriptionStatus> = {
  active: 'ACTIVE',
  trialing: 'TRIALING',
  past_due: 'PAST_DUE',
  canceled: 'CANCELED',
  incomplete: 'INCOMPLETE',
  incomplete_expired: 'INCOMPLETE_EXPIRED',
  unpaid: 'UNPAID',
  paused: 'PAUSED',
};

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

export async function registerBillingRoutes(app: FastifyInstance): Promise<void> {
  const { prisma, env, stripe } = app;
  const appUrl = env.PUBLIC_APP_URL.replace(/\/$/, '');

  app.get('/billing/me', async (req) => {
    const user = requireActiveUser(req);
    return getUserPlan(prisma, env, user.id);
  });

  app.post(
    '/billing/checkout',
    { config: { rateLimit: rlPolicy('billingSession') } },
    async (req) => {
      const user = requireVerifiedEmail(req);
      requireCreator(req);
      const existing = await prisma.subscription.findUnique({ where: { userId: user.id } });
      if (existing && !['CANCELED', 'INCOMPLETE_EXPIRED'].includes(existing.status)) {
        throw errors.conflict(
          'A Creator Plus subscription already exists. Manage it in the billing portal.',
        );
      }

      const persistedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      let customerId = persistedUser.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.createCustomer({
          email: persistedUser.email,
          name: persistedUser.displayName,
          metadata: { userId: persistedUser.id },
        });
        customerId = customer.id;
        await prisma.user.update({
          where: { id: persistedUser.id },
          data: { stripeCustomerId: customerId },
        });
      }

      const session = await stripe.createCheckoutSession({
        mode: 'subscription',
        customer: customerId,
        client_reference_id: persistedUser.id,
        line_items: [{ price: env.STRIPE_CREATOR_PLUS_PRICE_ID, quantity: 1 }],
        metadata: { userId: persistedUser.id, plan: 'CREATOR_PLUS' },
        subscription_data: { metadata: { userId: persistedUser.id, plan: 'CREATOR_PLUS' } },
        success_url: `${appUrl}/settings/billing?success=1`,
        cancel_url: `${appUrl}/settings/billing?canceled=1`,
      });
      if (!session.url) throw errors.internal();
      return { url: session.url };
    },
  );

  app.post(
    '/billing/portal',
    { config: { rateLimit: rlPolicy('billingSession') } },
    async (req) => {
      const user = requireActiveUser(req);
      const persistedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      if (!persistedUser.stripeCustomerId) {
        throw errors.conflict('No Stripe billing account exists for this user.');
      }
      const session = await stripe.createPortalSession({
        customer: persistedUser.stripeCustomerId,
        return_url: `${appUrl}/settings/billing`,
      });
      return { url: session.url };
    },
  );
}

export async function registerStripeWebhookRoutes(app: FastifyInstance): Promise<void> {
  const { prisma, env, stripe } = app;

  // This parser is encapsulated to this route plugin. Stripe signature
  // verification must receive the exact bytes before JSON parsing.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer', bodyLimit: 256 * 1024 },
    (_req, body, done) => done(null, body),
  );

  app.post<{ Body: Buffer }>('/webhooks/stripe', async (req, reply) => {
    const signature = req.headers['stripe-signature'];
    if (typeof signature !== 'string' || !Buffer.isBuffer(req.body)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid Stripe webhook request');
    }

    let event: Stripe.Event;
    try {
      event = stripe.constructWebhookEvent(req.body, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid Stripe webhook signature');
    }

    try {
      await prisma.$transaction(async (tx) => {
        const processed = await tx.stripeWebhookEvent.findUnique({ where: { id: event.id } });
        if (processed) return;

        switch (event.type) {
          case 'checkout.session.completed': {
            const session = event.data.object as Stripe.Checkout.Session;
            const userId = session.client_reference_id ?? session.metadata?.userId;
            const customerId = stripeId(session.customer);
            if (userId && customerId) {
              await tx.user.updateMany({
                where: { id: userId },
                data: { stripeCustomerId: customerId },
              });
            }
            break;
          }
          case 'customer.subscription.created':
          case 'customer.subscription.updated':
          case 'customer.subscription.deleted': {
            const subscription = event.data.object as Stripe.Subscription;
            const customerId = stripeId(subscription.customer);
            if (!customerId) throw new Error('Stripe subscription has no customer');

            const existing = await tx.subscription.findUnique({
              where: { stripeSubscriptionId: subscription.id },
            });
            const userId =
              subscription.metadata.userId ??
              existing?.userId ??
              (await tx.user.findUnique({ where: { stripeCustomerId: customerId } }))?.id;
            if (!userId) throw new Error('Stripe subscription is not linked to a VibePlay user');

            const plusItem = subscription.items.data.find(
              (item) => item.price.id === env.STRIPE_CREATOR_PLUS_PRICE_ID,
            );
            const status = plusItem ? STATUS_TO_DB[subscription.status] : 'CANCELED';
            await tx.user.update({ where: { id: userId }, data: { stripeCustomerId: customerId } });
            await tx.subscription.upsert({
              where: { userId },
              create: {
                userId,
                stripeSubscriptionId: subscription.id,
                stripeCustomerId: customerId,
                status,
                currentPeriodStart: plusItem
                  ? new Date(plusItem.current_period_start * 1000)
                  : null,
                currentPeriodEnd: plusItem ? new Date(plusItem.current_period_end * 1000) : null,
                cancelAtPeriodEnd: subscription.cancel_at_period_end,
              },
              update: {
                stripeSubscriptionId: subscription.id,
                stripeCustomerId: customerId,
                status,
                currentPeriodStart: plusItem
                  ? new Date(plusItem.current_period_start * 1000)
                  : null,
                currentPeriodEnd: plusItem ? new Date(plusItem.current_period_end * 1000) : null,
                cancelAtPeriodEnd: subscription.cancel_at_period_end,
              },
            });
            break;
          }
          case 'invoice.payment_succeeded':
          case 'invoice.payment_failed':
            // Subscription status changes are authoritative and arrive through
            // customer.subscription.updated; invoice events are still deduped.
            break;
          default:
            break;
        }

        await tx.stripeWebhookEvent.create({
          data: { id: event.id, type: event.type },
        });
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }

    reply.status(204).send();
  });
}
