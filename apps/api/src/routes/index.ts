import type { FastifyInstance } from 'fastify';

/**
 * Domain route registry. Route modules are added phase by phase
 * (auth → catalog/social → creator → uploads → admin).
 */
export async function registerDomainRoutes(_app: FastifyInstance): Promise<void> {
  // Populated in later phases.
}
