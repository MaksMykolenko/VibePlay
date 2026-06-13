import type { FastifyInstance } from 'fastify';

/**
 * Test-only support routes (E2E harness). Registered ONLY when
 * TEST_MAILBOX=true and never in production (buildApp enforces both).
 *
 * The memory mailer keeps sent messages in-process; this endpoint lets the
 * Playwright suite read verification/reset emails exactly like a human would
 * read them in Mailpit when running against the Docker stack.
 */
export async function registerTestSupportRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { to?: string } }>('/mailbox', async (req) => {
    const to = req.query.to;
    const messages = app.mailer.outbox
      .filter((message) => !to || message.to === to)
      .map((message) => ({ to: message.to, subject: message.subject, text: message.text }));
    return { messages };
  });
}
