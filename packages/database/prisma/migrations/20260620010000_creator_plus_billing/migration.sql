-- Stripe Billing state is separate from authorization roles. Existing users
-- remain on the free plan because they have no Subscription row.
CREATE TYPE "SubscriptionPlan" AS ENUM ('CREATOR_PLUS');
CREATE TYPE "SubscriptionStatus" AS ENUM (
  'ACTIVE',
  'TRIALING',
  'PAST_DUE',
  'CANCELED',
  'INCOMPLETE',
  'INCOMPLETE_EXPIRED',
  'UNPAID',
  'PAUSED'
);

ALTER TABLE "User" ADD COLUMN "stripeCustomerId" TEXT;

CREATE TABLE "Subscription" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'stripe',
  "stripeSubscriptionId" TEXT NOT NULL,
  "stripeCustomerId" TEXT NOT NULL,
  "plan" "SubscriptionPlan" NOT NULL DEFAULT 'CREATOR_PLUS',
  "status" "SubscriptionStatus" NOT NULL,
  "currentPeriodStart" TIMESTAMP(3),
  "currentPeriodEnd" TIMESTAMP(3),
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StripeWebhookEvent" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");
CREATE INDEX "Subscription_status_currentPeriodEnd_idx" ON "Subscription"("status", "currentPeriodEnd");
CREATE INDEX "Subscription_stripeCustomerId_idx" ON "Subscription"("stripeCustomerId");
CREATE INDEX "StripeWebhookEvent_processedAt_idx" ON "StripeWebhookEvent"("processedAt");

ALTER TABLE "Subscription"
ADD CONSTRAINT "Subscription_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
