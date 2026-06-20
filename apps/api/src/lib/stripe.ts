import Stripe from 'stripe';
import type { ApiEnv } from '@vibeplay/config';

export interface StripeGateway {
  createCustomer(params: Stripe.CustomerCreateParams): Promise<Stripe.Customer>;
  createCheckoutSession(
    params: Stripe.Checkout.SessionCreateParams,
  ): Promise<Stripe.Checkout.Session>;
  createPortalSession(
    params: Stripe.BillingPortal.SessionCreateParams,
  ): Promise<Stripe.BillingPortal.Session>;
  constructWebhookEvent(payload: Buffer, signature: string, secret: string): Stripe.Event;
}

export function createStripeGateway(env: ApiEnv): StripeGateway {
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);
  return {
    createCustomer: (params) => stripe.customers.create(params),
    createCheckoutSession: (params) => stripe.checkout.sessions.create(params),
    createPortalSession: (params) => stripe.billingPortal.sessions.create(params),
    constructWebhookEvent: (payload, signature, secret) =>
      stripe.webhooks.constructEvent(payload, signature, secret),
  };
}

export type { Stripe };
