/**
 * Canonical enums shared between API, worker, game-host and web.
 * These string values MUST match the Prisma enums in packages/database.
 */

export const USER_ROLES = ['PLAYER', 'CREATOR', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['ACTIVE', 'SUSPENDED', 'BANNED', 'DELETED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const GAME_STATUSES = [
  'DRAFT',
  'PENDING_REVIEW',
  'PUBLISHED',
  'REJECTED',
  'HIDDEN',
  'SUSPENDED',
] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];

export const GAME_VERSION_STATUSES = [
  'UPLOADING',
  'QUARANTINED',
  'VALIDATING',
  'SCAN_FAILED',
  'READY_FOR_REVIEW',
  'APPROVED',
  'REJECTED',
  'PUBLISHED',
  'ARCHIVED',
] as const;
export type GameVersionStatus = (typeof GAME_VERSION_STATUSES)[number];

export const MODERATION_DECISIONS = ['APPROVE', 'REJECT'] as const;
export type ModerationDecisionType = (typeof MODERATION_DECISIONS)[number];

export const COMMENT_STATUSES = ['VISIBLE', 'HIDDEN', 'DELETED'] as const;
export type CommentStatus = (typeof COMMENT_STATUSES)[number];

export const REPORT_TARGET_TYPES = ['GAME', 'COMMENT', 'USER'] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const REPORT_REASONS = [
  'MALICIOUS_BEHAVIOR',
  'COPYRIGHT',
  'STOLEN_CONTENT',
  'ADULT_CONTENT',
  'HATE',
  'HARASSMENT',
  'SPAM',
  'IMPERSONATION',
  'OTHER',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = ['OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const NOTIFICATION_TYPES = [
  'EMAIL_VERIFIED',
  'GAME_VALIDATION_FAILED',
  'GAME_READY_FOR_REVIEW',
  'GAME_APPROVED',
  'GAME_REJECTED',
  'NEW_COMMENT',
  'REPORT_RESOLVED',
  'ACCOUNT_SUSPENDED',
  'PLATFORM',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const GAME_CATEGORIES = [
  'Action',
  'Adventure',
  'Arcade',
  'Puzzle',
  'Racing',
  'RPG',
  'Shooter',
  'Simulator',
  'Sports',
  'Strategy',
  'Platformer',
  'Casual',
] as const;
export type GameCategory = (typeof GAME_CATEGORIES)[number];

export const AGE_RATINGS = ['EVERYONE', 'TEEN', 'MATURE'] as const;
export type AgeRating = (typeof AGE_RATINGS)[number];

export const AI_DISCLOSURES = ['NONE', 'ASSISTED', 'GENERATED'] as const;
export type AiDisclosure = (typeof AI_DISCLOSURES)[number];

export const FEATURED_CATEGORIES = ['HERO', 'TRENDING', 'EDITORS_CHOICE'] as const;
export type FeaturedCategory = (typeof FEATURED_CATEGORIES)[number];

export const GAME_SORTS = ['newest', 'popular', 'trending', 'most_liked', 'title'] as const;
export type GameSort = (typeof GAME_SORTS)[number];
