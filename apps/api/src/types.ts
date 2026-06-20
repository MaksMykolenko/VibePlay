import type { ApiEnv } from '@vibeplay/config';
import type { PrismaClient, Session, User } from '@vibeplay/database';
import type { ObjectStorage } from '@vibeplay/storage';
import type { Mailer } from './lib/mailer.js';
import type { ValidationQueue } from './lib/queue.js';
import type { GoogleOAuthService } from './lib/googleOAuth.js';
import type { StripeGateway } from './lib/stripe.js';

declare module 'fastify' {
  interface FastifyInstance {
    env: ApiEnv;
    prisma: PrismaClient;
    storage: ObjectStorage;
    mailer: Mailer;
    validationQueue: ValidationQueue;
    googleOAuth: GoogleOAuthService;
    stripe: StripeGateway;
    /** Optional redis ping for readiness checks (null when queue driver is inline). */
    redisPing: (() => Promise<void>) | null;
  }

  interface FastifyRequest {
    currentUser: User | null;
    currentSession: Session | null;
  }
}
