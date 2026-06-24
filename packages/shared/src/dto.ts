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
  SupportedDevice,
  UserRole,
  UserStatus,
} from './enums.js';
import type { AnalyticsEventType } from './analyticsEvents.js';
import type { GameMultiplayerDto } from './rooms.js';

/** Public view of a user (safe to expose to anyone). */
export interface PublicUserDto {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  role: UserRole;
  creatorPlus: boolean;
  createdAt: string;
}

export type BillingPlan = 'FREE' | 'CREATOR_PLUS';
export type BillingStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid'
  | 'paused';

export interface CreatorEntitlementsDto {
  maxPublishedGames: number;
  maxGameVersionsPerGame: number;
  maxUploadBytes: number;
  advancedAnalytics: boolean;
  creatorBadge: boolean;
  priorityModerationLabel: boolean;
  enhancedStorefront: boolean;
}

export interface BillingMeDto {
  plan: BillingPlan;
  status: BillingStatus | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  entitlements: CreatorEntitlementsDto;
}

export type CreatorAnalyticsRange = '7d' | '30d' | '90d';

export interface CreatorAnalyticsDto {
  range: CreatorAnalyticsRange;
  period: {
    from: string;
    to: string;
  };
  summary: {
    totalGames: number;
    publishedGames: number;
    inModerationGames: number;
    draftGames: number;
    rejectedGames: number;
    totalPlays: number;
    playsInRange: number;
    likes: number;
    comments: number;
    averageDurationSeconds: number | null;
  };
  timeseries: {
    date: string;
    plays: number;
  }[];
  topGames: {
    gameId: string;
    slug: string;
    title: string;
    plays: number;
    likes: number;
    comments: number;
  }[];
  recentActivity: {
    type: 'PLAY' | 'LIKE' | 'COMMENT';
    count: number;
    latestAt: string | null;
  }[];
  eventMetrics: {
    launchSuccesses: number;
    launchFailures: number;
    playsStarted: number;
    recent: { type: AnalyticsEventType; count: number }[];
    topGamesByLaunch: {
      gameId: string;
      slug: string;
      title: string;
      launches: number;
    }[];
  };
  entitlements: {
    creatorPlus: boolean;
    advancedAnalytics: boolean;
  };
  advanced: {
    uniquePlayers: number;
    loggedInPlays: number;
    guestPlays: number;
    returningPlayers: number;
    cloudSaveUsers: number;
    cloudSaveAdoptionPercent: number | null;
    durationPercentiles: {
      p50Seconds: number;
      p90Seconds: number;
    } | null;
    comparison: {
      previousPeriodPlays: number;
      changePercent: number | null;
      daily: {
        date: string;
        plays: number;
        previousDate: string;
        previousPlays: number;
      }[];
    };
    games: {
      gameId: string;
      slug: string;
      title: string;
      plays: number;
      uniquePlayers: number;
      loggedInPlays: number;
      guestPlays: number;
      averageDurationSeconds: number | null;
      cloudSaveUsers: number;
      versions: {
        versionId: string;
        version: string;
        plays: number;
      }[];
    }[];
    conversion: {
      registrationCta: 'AVAILABLE' | 'NOT_ENOUGH_INTERNAL_DATA';
      registrationClicks: number;
      registrationCompletions: number;
      loginClicks: number;
      loginCompletions: number;
    };
    eventInsights: {
      launchSuccessRate: number | null;
      launchFailureReasons: { code: string; count: number }[];
      cloudSaveFunnel: {
        ctaShown: number;
        signupClicks: number;
        loginClicks: number;
        syncPrompts: number;
        syncAccepted: number;
      };
      guestExitActions: { type: AnalyticsEventType; count: number }[];
      customEvents: { name: string; count: number }[];
      versions: {
        gameId: string;
        gameTitle: string;
        versionId: string;
        version: string;
        events: number;
        launchSuccesses: number;
        launchFailures: number;
      }[];
    };
  } | null;
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
  devices: SupportedDevice[];
  creator: PublicUserDto;
  likesCount: number;
  playsCount: number;
  multiplayer: boolean;
  aiDisclosure: AiDisclosure;
  featuredCategory: FeaturedCategory | null;
  publishedAt: string | null;
  updatedAt: string;
}

export interface GameControlDto {
  action: string;
  keys: string;
}

export interface GameDetailDto extends GameListItemDto {
  description: string;
  tags: string[];
  controls: GameControlDto[];
  toolsUsed: string[];
  screenshots: { id: string; url: string; sortOrder: number }[];
  publishedVersion: {
    id: string;
    version: string;
    changelog: string;
    approvedAt: string | null;
  } | null;
  changelog: { version: string; date: string; notes: string }[];
  /** Multiplayer metadata. `wsUrl` is populated only for the owner/admin viewer. */
  multiplayerInfo: GameMultiplayerDto;
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

/** A single cloud save (full payload). Returned by GET/PUT of one game's save. */
export interface GameSaveDto {
  gameId: string;
  /** The stored game state (opaque JSON to the platform). */
  data: unknown;
  schemaVersion: number;
  sizeBytes: number;
  dataHash: string;
  createdAt: string;
  updatedAt: string;
}

/** Lightweight save metadata (no payload). Returned by the list endpoint. */
export interface GameSaveSummaryDto {
  gameId: string;
  schemaVersion: number;
  sizeBytes: number;
  dataHash: string;
  createdAt: string;
  updatedAt: string;
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

/** Avatar binary upload (same-origin; the API streams bytes into private storage). */
export interface AvatarUploadIntentResponseDto {
  /** HMAC token authorizing the matching PUT to uploadUrl. */
  token: string;
  /** Same-origin endpoint the browser PUTs the raw image bytes to. */
  uploadUrl: string;
  /** Server-generated object key (echoed back to the complete step). */
  objectKey: string;
  method: 'PUT';
  headers: Record<string, string>;
  maxBytes: number;
  expiresAt: string;
}

export type GameCoverUploadIntentResponseDto = AvatarUploadIntentResponseDto;

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
