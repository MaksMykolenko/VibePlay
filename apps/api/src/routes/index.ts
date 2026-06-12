import type { FastifyInstance } from 'fastify';
import { registerAuthRoutes } from './auth.js';
import { registerProfileRoutes } from './profiles.js';

/**
 * Domain route registry. Route modules are added phase by phase
 * (auth → catalog/social → creator → uploads → admin).
 */
export async function registerDomainRoutes(app: FastifyInstance): Promise<void> {
  await app.register(registerAuthRoutes, { prefix: '/api/auth' });
  await app.register(registerProfileRoutes, { prefix: '/api' });
}
