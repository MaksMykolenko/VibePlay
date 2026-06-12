import type {
  AgeRating,
  AiDisclosure,
  CommentStatus,
  FeaturedCategory,
  GameStatus,
  GameVersionStatus,
  NotificationType,
  ReportReason,
  ReportStatus,
  ReportTargetType,
  UserRole,
  UserStatus,
} from './enums.js';

/** Public view of a user (safe to expose to anyone). */
export interface PublicUserDto {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  role: UserRole;
  createdAt: string;
}

/** The authenticated user's own view. */
export interface NotificationPrefsDto {
  moderationUpdates: boolean;
  social: boolean;
  platformNews: boolean;
}

export interface CurrentUserDto extends PublicUserDto {
  email: string;
  status: UserStatus;
  emailVerified: boolean;
  lastLoginAt: string | null;
  notificationPrefs: NotificationPrefsDto;
}

export interface SessionDto {
  id: string;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
  current: boolean;
}

export interface GameListItemDto {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  category: string;
  ageRating: AgeRating;
  status: GameStatus;
  coverUrl: string | null;
  creator: PublicUserDto;
  likesCount: number;
  playsCount: number;
  multiplayer: boolean;
  aiDisclosure: AiDisclosure;
  featuredCategory: FeaturedCategory | null;
  publishedAt: string | null;
  updatedAt: string;
}

export interface GameDetailDto extends GameListItemDto {
  description: string;
  tags: string[];
  devices: string[];
  controls: string[];
  toolsUsed: string[];
  screenshots: { id: string; url: string; sortOrder: number }[];
  publishedVersion: {
    id: string;
    version: string;
    changelog: string;
    approvedAt: string | null;
  } | null;
  changelog: { version: string; date: string; notes: string }[];
  viewer: {
    liked: boolean;
    favorited: boolean;
    isOwner: boolean;
  } | null;
}

export interface GameVersionDto {
  id: string;
  gameId: string;
  version: string;
  status: GameVersionStatus;
  compressedSize: number | null;
  uncompressedSize: number | null;
  fileCount: number | null;
  entrypoint: string | null;
  contentHash: string | null;
  aiDisclosure: AiDisclosure;
  toolsUsed: string[];
  changelog: string;
  validationReport: ValidationReportDto | null;
  rejectReason: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  createdAt: string;
}

export interface ValidationReportDto {
  ok: boolean;
  checks: { name: string; ok: boolean; detail?: string }[];
  scanner: {
    engine: string;
    result: 'clean' | 'infected' | 'error' | 'disabled';
    signature?: string;
  };
  fileCount?: number;
  uncompressedSize?: number;
  entrypoint?: string;
  failReason?: string;
}

export interface CommentDto {
  id: string;
  gameId: string;
  body: string;
  status: CommentStatus;
  author: PublicUserDto;
  createdAt: string;
  updatedAt: string;
  isOwn: boolean;
}

export interface ReportDto {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  targetLabel: string;
  reason: ReportReason;
  details: string;
  status: ReportStatus;
  reporter: PublicUserDto | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  metadata: Record<string, string>;
}

export interface PaginatedDto<T> {
  items: T[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface LaunchDescriptorDto {
  sessionId: string;
  gameUrl: string;
  gameVersionId: string;
  expiresAt: string;
  permissions: string[];
}

export interface UploadIntentResponseDto {
  uploadId: string;
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: string;
  maxBytes: number;
}

export interface UploadStatusDto {
  uploadId: string;
  versionId: string;
  versionStatus: GameVersionStatus;
  validationReport: ValidationReportDto | null;
}

export interface InviteDto {
  id: string;
  /** Plain code — returned exactly once at creation time. */
  code?: string;
  email: string | null;
  role: UserRole;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

export interface AuditLogEntryDto {
  id: string;
  actor: PublicUserDto | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface HealthDto {
  status: 'ok' | 'degraded';
  checks: Record<string, { ok: boolean; latencyMs?: number; detail?: string }>;
}
