import { z } from 'zod';
import {
  AGE_RATINGS,
  AI_DISCLOSURES,
  FEATURED_CATEGORIES,
  GAME_CATEGORIES,
  GAME_SORTS,
  REPORT_REASONS,
  REPORT_STATUSES,
  REPORT_TARGET_TYPES,
  SUPPORTED_DEVICES,
} from './enums.js';
import {
  BIO_MAX_LENGTH,
  COMMENT_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  GAME_DESC_MAX_LENGTH,
  GAME_SHORT_DESC_MAX_LENGTH,
  GAME_TITLE_MAX_LENGTH,
  MAX_SCREENSHOTS,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  REPORT_DETAILS_MAX_LENGTH,
  USERNAME_REGEX,
} from './constants.js';

// ---------------------------------------------------------------------------
// Common
// ---------------------------------------------------------------------------

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'Invalid email address' }))
  .pipe(z.string().max(254));

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(USERNAME_REGEX, 'Username must be 3-20 chars: a-z, 0-9, underscore');

const COMMON_PASSWORDS = new Set([
  'password12',
  'password123',
  '1234567890',
  'qwertyuiop',
  'iloveyou12',
  'adminadmin',
  'letmein123',
  'welcome123',
  'monkey1234',
  'dragon1234',
]);

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH)
  .refine((p) => !COMMON_PASSWORDS.has(p.toLowerCase()), {
    message: 'This password is too common',
  });

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(20),
});

export const idSchema = z.string().min(8).max(64);

/** http(s) URL for avatars/covers — kept simple for MVP. */
export const httpUrlSchema = z
  .string()
  .trim()
  .max(2000)
  .pipe(z.url({ protocol: /^https?$/, message: 'Must be an http(s) URL' }));

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const registerSchema = z
  .object({
    email: emailSchema,
    username: usernameSchema,
    displayName: z.string().trim().min(1).max(DISPLAY_NAME_MAX_LENGTH),
    password: passwordSchema,
    inviteCode: z.string().trim().min(8).max(128).optional(),
    acceptTerms: z.literal(true, { message: 'You must accept the Terms of Service' }),
  })
  .strict(); // role/status/etc. in the payload are a hard validation error

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

export const verifyEmailSchema = z.object({ token: z.string().min(16).max(256) });
export const resendVerificationSchema = z.object({});
export const forgotPasswordSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({
  token: z.string().min(16).max(256),
  password: passwordSchema,
});

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export const updateProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(DISPLAY_NAME_MAX_LENGTH).optional(),
    bio: z.string().trim().max(BIO_MAX_LENGTH).optional(),
    avatarUrl: httpUrlSchema.nullable().optional(),
  })
  .strict(); // mass-assignment protection: role/email/id are rejected

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: passwordSchema,
});

// ---------------------------------------------------------------------------
// Games catalog
// ---------------------------------------------------------------------------

export const gamesListQuerySchema = paginationSchema.extend({
  category: z.enum(GAME_CATEGORIES).optional(),
  sort: z.enum(GAME_SORTS).default('popular'),
  featured: z.coerce.boolean().optional(),
  multiplayer: z.coerce.boolean().optional(),
  aiDisclosure: z.enum(AI_DISCLOSURES).optional(),
  q: z.string().trim().max(100).optional(),
  creator: usernameSchema.optional(),
});

export const searchQuerySchema = paginationSchema.extend({
  q: z.string().trim().min(1).max(100),
});

// ---------------------------------------------------------------------------
// Creator
// ---------------------------------------------------------------------------

export const gameControlSchema = z
  .object({
    action: z.string().trim().max(80),
    keys: z.string().trim().max(120),
  })
  .strict();

export const gameControlsSchema = z
  .array(gameControlSchema)
  .max(30)
  .transform((controls) =>
    controls.filter(({ action, keys }) => action.length > 0 || keys.length > 0),
  );

export const createGameSchema = z
  .object({
    title: z.string().trim().min(3).max(GAME_TITLE_MAX_LENGTH),
    shortDescription: z.string().trim().min(10).max(GAME_SHORT_DESC_MAX_LENGTH),
    description: z.string().trim().min(10).max(GAME_DESC_MAX_LENGTH),
    category: z.enum(GAME_CATEGORIES),
    ageRating: z.enum(AGE_RATINGS).default('EVERYONE'),
    tags: z.array(z.string().trim().min(1).max(24)).max(8).default([]),
    devices: z
      .array(z.enum(SUPPORTED_DEVICES))
      .min(1, 'Select at least one supported device')
      .max(16)
      .transform((devices) => [...new Set(devices)])
      .default(['desktop']),
    controls: gameControlsSchema.default([]),
    multiplayer: z.boolean().default(false),
    aiDisclosure: z.enum(AI_DISCLOSURES).default('NONE'),
    toolsUsed: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
    coverUrl: httpUrlSchema.nullable().optional(),
    screenshots: z.array(httpUrlSchema).max(MAX_SCREENSHOTS).default([]),
  })
  .strict();

export const updateGameSchema = createGameSchema.partial().strict();

export const createVersionSchema = z
  .object({
    version: z
      .string()
      .trim()
      .regex(/^\d+\.\d+\.\d+$/, 'Version must be semver, e.g. 1.0.0'),
    changelog: z.string().trim().max(2000).default(''),
    aiDisclosure: z.enum(AI_DISCLOSURES).default('NONE'),
    toolsUsed: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  })
  .strict();

export const uploadIntentSchema = z
  .object({
    versionId: idSchema,
    fileName: z.string().trim().min(1).max(255),
    fileSize: z.number().int().min(1),
    contentType: z.literal('application/zip'),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const uploadCompleteSchema = z.object({}).strict();

// Avatar binary upload. The browser uploads image bytes to the API (same-origin,
// like the ZIP flow) — MinIO is never exposed publicly. SVG is not an accepted
// content type because it can carry scripts.
export const avatarUploadIntentSchema = z
  .object({
    contentType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
    fileName: z.string().trim().min(1).max(255),
    size: z.number().int().min(1),
  })
  .strict();

export const avatarCompleteSchema = z
  .object({
    // Server-generated key returned by the upload-intent; re-validated against
    // the caller's own users/{id}/avatar/ prefix to prevent IDOR/path traversal.
    objectKey: z.string().trim().min(1).max(512),
  })
  .strict();

export const gameCoverUploadIntentSchema = avatarUploadIntentSchema;
export const gameCoverCompleteSchema = avatarCompleteSchema;

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export const createCommentSchema = z
  .object({ body: z.string().trim().min(1).max(COMMENT_MAX_LENGTH) })
  .strict();

export const updateCommentSchema = createCommentSchema;

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export const createReportSchema = z
  .object({
    targetType: z.enum(REPORT_TARGET_TYPES),
    targetId: idSchema,
    reason: z.enum(REPORT_REASONS),
    details: z.string().trim().max(REPORT_DETAILS_MAX_LENGTH).default(''),
  })
  .strict();

export const resolveReportSchema = z
  .object({
    status: z.enum(['REVIEWING', 'RESOLVED', 'DISMISSED']),
    note: z.string().trim().max(2000).default(''),
  })
  .strict();

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export const rejectVersionSchema = z
  .object({
    reason: z.string().trim().min(5).max(2000),
    notes: z.string().trim().max(2000).default(''),
  })
  .strict();

export const approveVersionSchema = z
  .object({ notes: z.string().trim().max(2000).default('') })
  .strict();

export const suspendUserSchema = z.object({ reason: z.string().trim().min(3).max(1000) }).strict();

export const createInviteSchema = z
  .object({
    email: emailSchema.optional(),
    role: z.enum(['PLAYER', 'CREATOR']).default('PLAYER'),
    expiresInDays: z.number().int().min(1).max(90).default(14),
  })
  .strict();

export const featureGameSchema = z
  .object({ category: z.enum(FEATURED_CATEGORIES).nullable() })
  .strict();

export const promoteCreatorSchema = z.object({}).strict();

export const adminUsersQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(100).optional(),
  role: z.enum(['PLAYER', 'CREATOR', 'ADMIN']).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'BANNED', 'DELETED']).optional(),
});

export const adminReportsQuerySchema = paginationSchema.extend({
  status: z.enum(REPORT_STATUSES).optional(),
});

export const auditLogQuerySchema = paginationSchema.extend({
  action: z.string().trim().max(64).optional(),
  actorId: idSchema.optional(),
});

/** Per-user notification preferences (Settings → Notifications). */
export const notificationPrefsSchema = z
  .object({
    moderationUpdates: z.boolean(),
    social: z.boolean(),
    platformNews: z.boolean(),
  })
  .strict();

/** Beta feedback / bug report (spec §38). */
export const createFeedbackSchema = z
  .object({
    category: z.enum(['FEEDBACK', 'BUG']),
    message: z.string().trim().min(5).max(4000),
    page: z.string().trim().max(300).default(''),
  })
  .strict();

export const adminFeedbackQuerySchema = paginationSchema.extend({
  status: z.enum(['OPEN', 'RESOLVED']).optional(),
});

export const resolveFeedbackSchema = z.object({}).strict();
