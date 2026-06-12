import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client.js';

export * from './generated/client.js';
export type * from './generated/models.js';
export type { PrismaClient } from './generated/client.js';

export interface CreateClientOptions {
  databaseUrl: string;
  log?: ('query' | 'info' | 'warn' | 'error')[];
}

export function createPrismaClient(opts: CreateClientOptions): PrismaClient {
  const adapter = new PrismaPg({ connectionString: opts.databaseUrl });
  return new PrismaClient({ adapter, log: opts.log ?? ['warn', 'error'] });
}
