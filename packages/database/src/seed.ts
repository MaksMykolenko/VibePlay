/**
 * Development seed (spec §42).
 *
 * Refuses to run in production. Dev passwords below are for LOCAL DEVELOPMENT ONLY
 * and are documented in README — production admins are created via `npm run grant-admin`.
 */
import argon2 from 'argon2';
import { createPrismaClient } from './index.js';

if (process.env.NODE_ENV === 'production') {
  console.error('Seed refuses to run with NODE_ENV=production.');
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const prisma = createPrismaClient({ databaseUrl });

const DEV_PASSWORD = process.env.SEED_PASSWORD ?? 'vibeplay-dev-password-1';
const PEPPER = process.env.PASSWORD_PEPPER ?? 'dev-pepper-not-secret';

async function hash(password: string): Promise<string> {
  return argon2.hash(password + PEPPER, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

async function main() {
  const passwordHash = await hash(DEV_PASSWORD);
  const now = new Date();

  const admin = await prisma.user.upsert({
    where: { email: 'admin@vibeplay.local' },
    update: {},
    create: {
      email: 'admin@vibeplay.local',
      username: 'admin_dev',
      displayName: 'VibePlay Admin (dev)',
      passwordHash,
      role: 'ADMIN',
      bio: 'Local development admin.',
      emailVerifiedAt: now,
    },
  });

  const creator = await prisma.user.upsert({
    where: { email: 'creator@vibeplay.local' },
    update: {},
    create: {
      email: 'creator@vibeplay.local',
      username: 'creator_dev',
      displayName: 'Demo Creator (dev)',
      passwordHash,
      role: 'CREATOR',
      bio: 'Building three.js experiments. Local development creator.',
      emailVerifiedAt: now,
    },
  });

  const player = await prisma.user.upsert({
    where: { email: 'player@vibeplay.local' },
    update: {},
    create: {
      email: 'player@vibeplay.local',
      username: 'player_dev',
      displayName: 'Demo Player (dev)',
      passwordHash,
      role: 'PLAYER',
      bio: 'Local development player.',
      emailVerifiedAt: now,
    },
  });

  // --- Games ------------------------------------------------------------

  const hello = await prisma.game.upsert({
    where: { slug: 'hello-vibeplay' },
    update: {},
    create: {
      slug: 'hello-vibeplay',
      creatorId: creator.id,
      title: 'Hello VibePlay',
      shortDescription: 'A tiny canvas game that proves the upload → review → publish pipeline.',
      description:
        'Hello VibePlay is the reference fixture game. It is a small, dependency-free canvas game used to validate the full pipeline: ZIP upload, quarantine validation, malware scan, moderation and sandboxed launch. Click the orbs before the timer runs out.',
      category: 'Arcade',
      ageRating: 'EVERYONE',
      status: 'DRAFT',
      tags: ['canvas', 'fixture', 'demo'],
      devices: ['desktop', 'mouse', 'touch'],
      controls: [{ action: 'Collect orbs', keys: 'Mouse / touch' }],
      multiplayer: false,
      aiDisclosure: 'NONE',
    },
  });

  const puzzle = await prisma.game.upsert({
    where: { slug: 'prism-puzzle' },
    update: {},
    create: {
      slug: 'prism-puzzle',
      creatorId: creator.id,
      title: 'Prism Puzzle',
      shortDescription: 'Rotate light beams through prisms in this relaxing logic playground.',
      description:
        'A draft puzzle game used to exercise the creator dashboard. It has no uploaded build yet — submit a ZIP through the publish flow to move it through the pipeline.',
      category: 'Puzzle',
      ageRating: 'EVERYONE',
      status: 'DRAFT',
      tags: ['puzzle', 'logic'],
      devices: ['desktop', 'mobile'],
      multiplayer: false,
      aiDisclosure: 'ASSISTED',
      toolsUsed: ['Claude'],
    },
  });

  // A rejected version example for the dashboard
  const rejectedVersion = await prisma.gameVersion.upsert({
    where: { gameId_version: { gameId: puzzle.id, version: '0.1.0' } },
    update: {},
    create: {
      gameId: puzzle.id,
      version: '0.1.0',
      status: 'REJECTED',
      changelog: 'First attempt.',
      rejectReason: 'Build did not contain index.html at the archive root.',
      submittedAt: now,
      rejectedAt: now,
      validationReport: {
        ok: false,
        failReason: 'missing root index.html',
        checks: [{ name: 'root index.html', ok: false }],
        scanner: { engine: 'none', result: 'error' },
      },
    },
  });

  await prisma.moderationDecision.createMany({
    data: [
      {
        gameVersionId: rejectedVersion.id,
        moderatorId: admin.id,
        decision: 'REJECT',
        reason: 'Build did not contain index.html at the archive root.',
      },
    ],
    skipDuplicates: true,
  });

  // --- Social -----------------------------------------------------------

  await prisma.comment.createMany({
    data: [
      {
        gameId: hello.id,
        userId: player.id,
        body: 'Nice little fixture game — pipeline works!',
      },
    ],
    skipDuplicates: true,
  });

  await prisma.report.createMany({
    data: [
      {
        reporterId: player.id,
        targetType: 'GAME',
        targetId: puzzle.id,
        reason: 'OTHER',
        details: 'Example report seeded for the admin queue.',
      },
    ],
    skipDuplicates: true,
  });

  await prisma.notification.createMany({
    data: [
      {
        userId: creator.id,
        type: 'PLATFORM',
        title: 'Welcome to the VibePlay private beta',
        body: 'Your creator account is ready. Upload your first game build from the Creator dashboard.',
      },
      {
        userId: player.id,
        type: 'PLATFORM',
        title: 'Welcome to the VibePlay private beta',
        body: 'Browse the catalog and tell us what breaks.',
      },
    ],
    skipDuplicates: true,
  });

  console.log('Seed complete:');
  console.log(`  admin:   admin@vibeplay.local    (password: ${DEV_PASSWORD})`);
  console.log(`  creator: creator@vibeplay.local  (password: ${DEV_PASSWORD})`);
  console.log(`  player:  player@vibeplay.local   (password: ${DEV_PASSWORD})`);
  console.log('  games:   hello-vibeplay (draft), prism-puzzle (draft + rejected version)');
  console.log(
    'Run the publish flow (upload fixtures/games/hello-vibeplay.zip) to get a published game.',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
