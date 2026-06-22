import type { FastifyInstance } from 'fastify';
import { registerAdminRoutes } from './admin.js';
import { registerAuthRoutes } from './auth.js';
import { registerCatalogRoutes } from './catalog.js';
import { registerCreatorRoutes } from './creator.js';
import { registerProfileRoutes } from './profiles.js';
import { registerGameSaveRoutes } from './gameSaves.js';
import { registerGoogleOAuthRoutes } from './googleOAuth.js';
import { registerGameCoverRoutes } from './gameCover.js';
import { registerBillingRoutes, registerStripeWebhookRoutes } from './billing.js';
import { registerAnalyticsRoutes } from './analytics.js';

/**
 * Domain route registry. Route modules are added phase by phase
 * (auth → catalog/social → creator → uploads → admin).
 */
export async function registerDomainRoutes(app: FastifyInstance): Promise<void> {
  await app.register(registerAuthRoutes, { prefix: '/api/auth' });
  await app.register(registerGoogleOAuthRoutes, { prefix: '/api/auth' });
  await app.register(registerStripeWebhookRoutes, { prefix: '/api' });
  await app.register(registerBillingRoutes, { prefix: '/api' });
  await app.register(registerGameCoverRoutes, { prefix: '/api' });
  await app.register(registerProfileRoutes, { prefix: '/api' });
  await app.register(registerGameSaveRoutes, { prefix: '/api' });
  await app.register(registerAnalyticsRoutes, { prefix: '/api' });
  await app.register(registerCatalogRoutes, { prefix: '/api' });
  await app.register(registerCreatorRoutes, { prefix: '/api' });
  await app.register(registerAdminRoutes, { prefix: '/api/admin' });
}
