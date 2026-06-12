import type { FastifyInstance } from 'fastify';
import {
  ApiError,
  errors,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  changePasswordSchema,
} from '@vibeplay/shared';
import { audit } from '../lib/audit.js';
import { generateToken, hashPassword, hashToken, verifyPassword } from '../lib/crypto.js';
import { requireActiveUser, requireAuth } from '../lib/guards.js';
import { emailTemplates } from '../lib/mailer.js';
import { notify } from '../lib/notify.js';
import { toCurrentUser, toSessionDto } from '../lib/serializers.js';
import { rlPolicy } from '../lib/rateLimit.js';
import {
  clearSessionCookies,
  createSession,
  revokeAllSessions,
  revokeSession,
  setSessionCookies,
} from '../lib/sessions.js';
import { parse } from '../lib/validate.js';

/** Pre-computed Argon2id hash of an unguessable value — keeps login timing uniform
 *  when the account does not exist. */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$WW91J3JlIGN1cmlvdXM$1b2P5gUh4yhi0Z5nL6h1+VYHCnLkfgPcdGqFJgX0Zxs';

const VERIFICATION_TTL_MS = 24 * 3600 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  const { prisma, env, mailer } = app;

  // ------------------------------------------------------------------ register
  app.post('/register', { config: { rateLimit: rlPolicy('register') } }, async (req, reply) => {
    const body = parse(registerSchema, req.body);

    // Invite-only beta (spec §10): the code is required and single-use.
    let invite: { id: string; role: 'PLAYER' | 'CREATOR' | 'ADMIN' } | null = null;
    if (env.INVITE_ONLY) {
      if (!body.inviteCode) {
        throw new ApiError(403, 'INVITE_REQUIRED', 'Registration is invite-only during the beta');
      }
      const found = await prisma.invite.findUnique({
        where: { codeHash: hashToken(body.inviteCode, env.SESSION_SECRET) },
      });
      if (!found || found.usedAt || found.expiresAt.getTime() < Date.now()) {
        throw new ApiError(403, 'INVITE_INVALID', 'This invite code is invalid or expired');
      }
      if (found.email && found.email !== body.email) {
        throw new ApiError(403, 'INVITE_INVALID', 'This invite is bound to a different email');
      }
      invite = { id: found.id, role: found.role === 'ADMIN' ? 'PLAYER' : found.role };
    }

    const [emailTaken, usernameTaken] = await Promise.all([
      prisma.user.findUnique({ where: { email: body.email }, select: { id: true } }),
      prisma.user.findUnique({ where: { username: body.username }, select: { id: true } }),
    ]);
    if (emailTaken)
      throw new ApiError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
    if (usernameTaken) throw new ApiError(409, 'USERNAME_TAKEN', 'This username is already taken');

    const passwordHash = await hashPassword(body.password, env.PASSWORD_PEPPER);
    const verifyToken = generateToken();

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: body.email,
          username: body.username,
          displayName: body.displayName,
          passwordHash,
          // Role comes ONLY from the invite (never from the request body).
          role: invite?.role ?? 'PLAYER',
        },
      });
      if (invite) {
        const used = await tx.invite.updateMany({
          where: { id: invite.id, usedAt: null },
          data: { usedAt: new Date(), usedById: created.id },
        });
        if (used.count === 0) {
          throw new ApiError(403, 'INVITE_INVALID', 'This invite code has just been used');
        }
      }
      await tx.emailVerificationToken.create({
        data: {
          userId: created.id,
          tokenHash: hashToken(verifyToken, env.SESSION_SECRET),
          expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
        },
      });
      return created;
    });

    await mailer.send({
      to: user.email,
      ...emailTemplates.verifyEmail(env.WEB_ORIGIN, verifyToken),
    });
    await audit(prisma, {
      actorId: user.id,
      action: 'auth.register',
      targetType: 'USER',
      targetId: user.id,
      req,
      secret: env.SESSION_SECRET,
    });

    // Auto-login after registration; email verification is still required
    // for creator actions (requireVerifiedEmail).
    const { token, csrfToken, session } = await createSession(prisma, env, user, req);
    setSessionCookies(reply, env, token, csrfToken, session.expiresAt);
    reply.status(201);
    return { user: toCurrentUser(user) };
  });

  // --------------------------------------------------------------------- login
  app.post('/login', { config: { rateLimit: rlPolicy('login') } }, async (req, reply) => {
    const body = parse(loginSchema, req.body);

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    const hash = user?.passwordHash ?? DUMMY_HASH;
    const passwordOk = await verifyPassword(hash, body.password, env.PASSWORD_PEPPER);

    if (!user || !passwordOk || user.status === 'DELETED') {
      throw errors.invalidCredentials();
    }
    if (user.status === 'SUSPENDED') throw errors.accountSuspended();
    if (user.status === 'BANNED') throw errors.accountBanned();

    const { token, csrfToken, session } = await createSession(prisma, env, user, req);
    setSessionCookies(reply, env, token, csrfToken, session.expiresAt);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    return { user: toCurrentUser({ ...user, lastLoginAt: new Date() }) };
  });

  // -------------------------------------------------------------------- logout
  app.post('/logout', async (req, reply) => {
    if (req.currentSession) {
      await revokeSession(prisma, req.currentSession.id);
    }
    clearSessionCookies(reply, env);
    return { ok: true };
  });

  app.post('/logout-all', async (req, reply) => {
    const user = requireAuth(req);
    const count = await revokeAllSessions(prisma, user.id);
    clearSessionCookies(reply, env);
    return { ok: true, revoked: count };
  });

  // ------------------------------------------------------------------------ me
  app.get('/me', async (req) => {
    const user = req.currentUser;
    if (!user) throw errors.unauthorized();
    return { user: toCurrentUser(user) };
  });

  // ------------------------------------------------------------------ sessions
  app.get('/sessions', async (req) => {
    const user = requireActiveUser(req);
    const sessions = await prisma.session.findMany({
      where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    return { sessions: sessions.map((s) => toSessionDto(s, req.currentSession?.id ?? '')) };
  });

  app.delete<{ Params: { id: string } }>('/sessions/:id', async (req) => {
    const user = requireActiveUser(req);
    const session = await prisma.session.findUnique({ where: { id: req.params.id } });
    if (!session || session.userId !== user.id) {
      throw errors.notFound('NOT_FOUND', 'Session not found');
    }
    await revokeSession(prisma, session.id);
    return { ok: true };
  });

  // -------------------------------------------------------------- verify email
  app.post('/verify-email', async (req) => {
    const body = parse(verifyEmailSchema, req.body);
    const record = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashToken(body.token, env.SESSION_SECRET) },
      include: { user: true },
    });
    if (!record || record.usedAt) {
      throw new ApiError(400, 'TOKEN_INVALID', 'This verification link is invalid or already used');
    }
    if (record.expiresAt.getTime() < Date.now()) {
      throw new ApiError(400, 'TOKEN_EXPIRED', 'This verification link has expired');
    }

    await prisma.$transaction([
      prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: record.user.emailVerifiedAt ?? new Date() },
      }),
    ]);
    await notify(
      prisma,
      record.userId,
      'EMAIL_VERIFIED',
      'Email verified',
      'Your email address is verified. Welcome to the VibePlay beta!',
    );
    return { ok: true };
  });

  app.post(
    '/resend-verification',
    { config: { rateLimit: rlPolicy('resendVerification') } },
    async (req) => {
      const user = requireActiveUser(req);
      if (user.emailVerifiedAt) return { ok: true };
      const token = generateToken();
      await prisma.emailVerificationToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token, env.SESSION_SECRET),
          expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
        },
      });
      await mailer.send({ to: user.email, ...emailTemplates.verifyEmail(env.WEB_ORIGIN, token) });
      return { ok: true };
    },
  );

  // ----------------------------------------------------------- forgot password
  app.post(
    '/forgot-password',
    { config: { rateLimit: rlPolicy('forgotPassword') } },
    async (req) => {
      const body = parse(forgotPasswordSchema, req.body);
      const user = await prisma.user.findUnique({ where: { email: body.email } });
      // Generic response regardless of account existence (no enumeration).
      if (user && user.status !== 'DELETED' && user.status !== 'BANNED') {
        const token = generateToken();
        await prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: hashToken(token, env.SESSION_SECRET),
            expiresAt: new Date(Date.now() + RESET_TTL_MS),
          },
        });
        await mailer.send({
          to: user.email,
          ...emailTemplates.resetPassword(env.WEB_ORIGIN, token),
        });
      }
      return {
        ok: true,
        message: 'If an account exists for this email, a reset link has been sent.',
      };
    },
  );

  app.post('/reset-password', { config: { rateLimit: rlPolicy('resetPassword') } }, async (req) => {
    const body = parse(resetPasswordSchema, req.body);
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(body.token, env.SESSION_SECRET) },
    });
    if (!record || record.usedAt) {
      throw new ApiError(400, 'TOKEN_INVALID', 'This reset link is invalid or already used');
    }
    if (record.expiresAt.getTime() < Date.now()) {
      throw new ApiError(400, 'TOKEN_EXPIRED', 'This reset link has expired');
    }

    const passwordHash = await hashPassword(body.password, env.PASSWORD_PEPPER);
    await prisma.$transaction([
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      prisma.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await audit(prisma, {
      actorId: record.userId,
      action: 'auth.password_reset',
      targetType: 'USER',
      targetId: record.userId,
      req,
      secret: env.SESSION_SECRET,
    });
    return { ok: true };
  });

  // ----------------------------------------------------------- change password
  app.post(
    '/change-password',
    { config: { rateLimit: rlPolicy('changePassword') } },
    async (req, reply) => {
      const user = requireActiveUser(req);
      const body = parse(changePasswordSchema, req.body);
      const ok = await verifyPassword(user.passwordHash, body.currentPassword, env.PASSWORD_PEPPER);
      if (!ok) throw errors.invalidCredentials();

      const passwordHash = await hashPassword(body.newPassword, env.PASSWORD_PEPPER);
      await prisma.$transaction([
        prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
        // Revoke every OTHER session; the current one stays valid.
        prisma.session.updateMany({
          where: { userId: user.id, revokedAt: null, id: { not: req.currentSession!.id } },
          data: { revokedAt: new Date() },
        }),
      ]);
      reply.status(200);
      return { ok: true };
    },
  );
}
