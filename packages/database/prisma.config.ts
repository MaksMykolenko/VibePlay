import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx src/seed.ts',
  },
  datasource: {
    // Only used by Prisma CLI (migrate/seed). The runtime client uses @prisma/adapter-pg.
    url: process.env.DATABASE_URL ?? 'postgresql://vibeplay:vibeplay@localhost:5432/vibeplay',
    shadowDatabaseUrl:
      process.env.SHADOW_DATABASE_URL ??
      'postgresql://vibeplay:vibeplay@localhost:5432/vibeplay_shadow',
  },
});
