import type { ApiEnv } from '@vibeplay/config';
import type { PrismaClient, Subscription, UserRole } from '@vibeplay/database';
import type {
  BillingMeDto,
  BillingPlan,
  BillingStatus,
  CreatorEntitlementsDto,
} from '@vibeplay/shared';

const MB = 1024 * 1024;
const ACTIVE_PLUS_STATUSES = new Set(['ACTIVE', 'TRIALING']);

const STATUS_TO_API: Record<Subscription['status'], BillingStatus> = {
  ACTIVE: 'active',
  TRIALING: 'trialing',
  PAST_DUE: 'past_due',
  CANCELED: 'canceled',
  INCOMPLETE: 'incomplete',
  INCOMPLETE_EXPIRED: 'incomplete_expired',
  UNPAID: 'unpaid',
  PAUSED: 'paused',
};

export function hasActiveCreatorPlus(
  subscription: Subscription | null | undefined,
  now = new Date(),
): boolean {
  if (!subscription || !ACTIVE_PLUS_STATUSES.has(subscription.status)) return false;
  return !subscription.currentPeriodEnd || subscription.currentPeriodEnd > now;
}

function entitlementsFor(plan: BillingPlan, env: ApiEnv): CreatorEntitlementsDto {
  const infrastructureMax = env.UPLOAD_MAX_COMPRESSED_MB * MB;
  if (plan === 'CREATOR_PLUS') {
    return {
      maxPublishedGames: 10,
      maxGameVersionsPerGame: 50,
      maxUploadBytes: Math.min(100 * MB, infrastructureMax),
      advancedAnalytics: true,
      creatorBadge: true,
      priorityModerationLabel: true,
      enhancedStorefront: true,
    };
  }
  return {
    maxPublishedGames: 1,
    maxGameVersionsPerGame: 10,
    maxUploadBytes: Math.min(50 * MB, infrastructureMax),
    advancedAnalytics: false,
    creatorBadge: false,
    priorityModerationLabel: false,
    enhancedStorefront: false,
  };
}

export function billingState(
  subscription: Subscription | null | undefined,
  env: ApiEnv,
): BillingMeDto {
  const plan: BillingPlan = hasActiveCreatorPlus(subscription) ? 'CREATOR_PLUS' : 'FREE';
  return {
    plan,
    status: subscription ? STATUS_TO_API[subscription.status] : null,
    currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
    entitlements: entitlementsFor(plan, env),
  };
}

export interface CreatorAccess {
  billing: BillingMeDto;
  bypassBillingLimits: boolean;
  role: UserRole;
}

export async function getCreatorAccess(
  prisma: PrismaClient,
  env: ApiEnv,
  userId: string,
): Promise<CreatorAccess> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { subscription: true },
  });
  return {
    billing: billingState(user.subscription, env),
    bypassBillingLimits: user.role === 'ADMIN' || user.role === 'OWNER',
    role: user.role,
  };
}

export async function getUserPlan(
  prisma: PrismaClient,
  env: ApiEnv,
  userId: string,
): Promise<BillingMeDto> {
  const subscription = await prisma.subscription.findUnique({ where: { userId } });
  return billingState(subscription, env);
}

export async function getCreatorEntitlements(
  prisma: PrismaClient,
  env: ApiEnv,
  userId: string,
): Promise<CreatorEntitlementsDto> {
  return (await getCreatorAccess(prisma, env, userId)).billing.entitlements;
}
