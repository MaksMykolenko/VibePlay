/**
 * Promote an existing user to ADMIN. This is the ONLY supported way to create
 * an admin in any environment — there is intentionally no public API for it.
 *
 * Usage: DATABASE_URL=... npm run grant-admin -- user@example.com
 */
import { createPrismaClient } from './index.js';

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error('Usage: npm run grant-admin -- <email>');
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const prisma = createPrismaClient({ databaseUrl });

try {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user with email ${email}. They must register first.`);
    process.exit(1);
  }
  await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
  await prisma.auditLog.create({
    data: {
      actorId: null,
      action: 'admin.grant_role_cli',
      targetType: 'USER',
      targetId: user.id,
      metadata: { email, via: 'grant-admin script' },
    },
  });
  console.log(`${email} is now an ADMIN.`);
} finally {
  await prisma.$disconnect();
}
