import type { FastifyInstance } from 'fastify';
import { registerAdminRoutes } from './admin.js';
import { registerAuthRoutes } from './auth.js';
import { registerCatalogRoutes } from './catalog.js';
import { registerCreatorRoutes } from './creator.js';
import { registerProfileRoutes } from './profiles.js';
import { registerGoogleOAuthRoutes } from './googleOAuth.js';

/**
 * Domain route registry. Route modules are added phase by phase
 * (auth → catalog/social → creator → uploads → admin).
 */
export async function registerDomainRoutes(app: FastifyInstance): Promise<void> {
  await app.register(registerAuthRoutes, { prefix: '/api/auth' });
  await app.register(registerGoogleOAuthRoutes, { prefix: '/api/auth' });
  await app.register(registerProfileRoutes, { prefix: '/api' });
  await app.register(registerCatalogRoutes, { prefix: '/api' });
  await app.register(registerCreatorRoutes, { prefix: '/api' });
  await app.register(registerAdminRoutes, { prefix: '/api/admin' });
}
