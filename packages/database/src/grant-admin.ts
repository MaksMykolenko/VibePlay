/**
 * Promote an existing user to ADMIN (or OWNER). This is the ONLY supported way
 * to create a privileged account in any environment — there is intentionally no
 * public API for it.
 *
 * OWNER is the platform founder tier (a superset of ADMIN) and should only ever
 * be granted to yourself.
 *
 * Usage: DATABASE_URL=... npm run grant-admin -- user@example.com [ADMIN|OWNER]
 */
import { createPrismaClient } from './index.js';

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error('Usage: npm run grant-admin -- <email> [ADMIN|OWNER]');
  process.exit(1);
}

// Optional role argument; defaults to ADMIN so existing usage is unchanged.
const GRANTABLE_ROLES = ['ADMIN', 'OWNER'] as const;
const roleArg = (process.argv[3] ?? 'ADMIN').trim().toUpperCase();
if (!(GRANTABLE_ROLES as readonly string[]).includes(roleArg)) {
  console.error(`Invalid role "${roleArg}". Use one of: ${GRANTABLE_ROLES.join(', ')}.`);
  process.exit(1);
}
const role = roleArg as (typeof GRANTABLE_ROLES)[number];

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
  await prisma.user.update({ where: { id: user.id }, data: { role } });
  await prisma.auditLog.create({
    data: {
      actorId: null,
      action: 'admin.grant_role_cli',
      targetType: 'USER',
      targetId: user.id,
      metadata: { email, role, via: 'grant-admin script' },
    },
  });
  console.log(`${email} is now ${role === 'OWNER' ? 'an OWNER' : 'an ADMIN'}.`);
} finally {
  await prisma.$disconnect();
}
