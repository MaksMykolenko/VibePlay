import type {
  Comment,
  Game,
  GameSave,
  GameScreenshot,
  GameVersion,
  Notification,
  Report,
  Session,
  Subscription,
  User,
} from '@vibeplay/database';
import type {
  CommentDto,
  CurrentUserDto,
  GameDetailDto,
  GameControlDto,
  GameListItemDto,
  GameSaveDto,
  GameSaveSummaryDto,
  GameVersionDto,
  NotificationDto,
  PaginatedDto,
  PublicUserDto,
  ReportDto,
  SessionDto,
  ValidationReportDto,
  SupportedDevice,
} from '@vibeplay/shared';
import { SUPPORTED_DEVICES } from '@vibeplay/shared';
import { hasActiveCreatorPlus } from './entitlements.js';

type UserWithSubscription = User & { subscription?: Subscription | null };

export function toPublicUser(u: UserWithSubscription): PublicUserDto {
  return {
    id: u.id,
    username: u.username,
    displayName: u.status === 'DELETED' ? 'Deleted user' : u.displayName,
    avatarUrl: u.avatarUrl,
    bio: u.bio,
    role: u.role,
    creatorPlus: hasActiveCreatorPlus(u.subscription),
    createdAt: u.createdAt.toISOString(),
  };
}

const DEFAULT_NOTIFICATION_PREFS = {
  moderationUpdates: true,
  social: true,
  platformNews: false,
} as const;

export function toCurrentUser(u: User): CurrentUserDto {
  const raw = (u.notificationPrefs ?? {}) as Partial<typeof DEFAULT_NOTIFICATION_PREFS>;
  return {
    ...toPublicUser(u),
    email: u.email,
    status: u.status,
    emailVerified: u.emailVerifiedAt != null,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    notificationPrefs: {
      moderationUpdates: raw.moderationUpdates ?? DEFAULT_NOTIFICATION_PREFS.moderationUpdates,
      social: raw.social ?? DEFAULT_NOTIFICATION_PREFS.social,
      platformNews: raw.platformNews ?? DEFAULT_NOTIFICATION_PREFS.platformNews,
    },
  };
}

export function toSessionDto(s: Session, currentSessionId: string): SessionDto {
  return {
    id: s.id,
    userAgent: s.userAgent,
    createdAt: s.createdAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
    current: s.id === currentSessionId,
  };
}

export type GameWithCreator = Game & { creator: UserWithSubscription };

function toGameControls(value: unknown): GameControlDto[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (control): control is { action: string; keys: string } =>
        typeof control === 'object' &&
        control !== null &&
        !Array.isArray(control) &&
        typeof (control as Record<string, unknown>).action === 'string' &&
        typeof (control as Record<string, unknown>).keys === 'string',
    )
    .map(({ action, keys }) => ({ action: action.trim(), keys: keys.trim() }))
    .filter(({ action, keys }) => action.length > 0 || keys.length > 0)
    .slice(0, 30);
}

function supportedDevices(devices: string[]): SupportedDevice[] {
  const normalized = SUPPORTED_DEVICES.filter((device) => devices.includes(device));
  return normalized.length > 0 ? normalized : ['desktop'];
}

export function toGameListItem(g: GameWithCreator): GameListItemDto {
  return {
    id: g.id,
    slug: g.slug,
    title: g.title,
    shortDescription: g.shortDescription,
    category: g.category,
    ageRating: g.ageRating,
    status: g.status,
    coverUrl: g.coverUrl,
    devices: supportedDevices(g.devices),
    creator: toPublicUser(g.creator),
    likesCount: g.likesCount,
    playsCount: g.playsCount,
    multiplayer: g.multiplayer,
    aiDisclosure: g.aiDisclosure,
    featuredCategory: g.featuredCategory,
    publishedAt: g.publishedAt?.toISOString() ?? null,
    updatedAt: g.updatedAt.toISOString(),
  };
}

export function toGameDetail(
  g: GameWithCreator & {
    screenshots: GameScreenshot[];
    publishedVersion: GameVersion | null;
    versions?: GameVersion[];
  },
  viewer: { liked: boolean; favorited: boolean; isOwner: boolean } | null,
): GameDetailDto {
  const changelog = (g.versions ?? [])
    .filter((v) => v.status === 'PUBLISHED' || v.status === 'ARCHIVED')
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((v) => ({
      version: v.version,
      date: (v.approvedAt ?? v.createdAt).toISOString(),
      notes: v.changelog,
    }));

  return {
    ...toGameListItem(g),
    description: g.description,
    tags: g.tags,
    controls: toGameControls(g.controls),
    toolsUsed: g.toolsUsed,
    screenshots: g.screenshots
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => ({ id: s.id, url: s.url, sortOrder: s.sortOrder })),
    publishedVersion: g.publishedVersion
      ? {
          id: g.publishedVersion.id,
          version: g.publishedVersion.version,
          changelog: g.publishedVersion.changelog,
          approvedAt: g.publishedVersion.approvedAt?.toISOString() ?? null,
        }
      : null,
    changelog,
    viewer,
  };
}

export function toGameVersionDto(v: GameVersion): GameVersionDto {
  return {
    id: v.id,
    gameId: v.gameId,
    version: v.version,
    status: v.status,
    compressedSize: v.compressedSize == null ? null : Number(v.compressedSize),
    uncompressedSize: v.uncompressedSize == null ? null : Number(v.uncompressedSize),
    fileCount: v.fileCount,
    entrypoint: v.entrypoint,
    contentHash: v.contentHash,
    aiDisclosure: v.aiDisclosure,
    toolsUsed: v.toolsUsed,
    changelog: v.changelog,
    validationReport: (v.validationReport as ValidationReportDto | null) ?? null,
    rejectReason: v.rejectReason,
    submittedAt: v.submittedAt?.toISOString() ?? null,
    approvedAt: v.approvedAt?.toISOString() ?? null,
    rejectedAt: v.rejectedAt?.toISOString() ?? null,
    createdAt: v.createdAt.toISOString(),
  };
}

export function toCommentDto(c: Comment & { user: User }, viewerId: string | null): CommentDto {
  const deleted = c.status === 'DELETED';
  return {
    id: c.id,
    gameId: c.gameId,
    body: deleted ? '[deleted]' : c.body,
    status: c.status,
    author: toPublicUser(c.user),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    isOwn: viewerId != null && c.userId === viewerId,
  };
}

export function toReportDto(r: Report & { reporter: User | null }, targetLabel: string): ReportDto {
  return {
    id: r.id,
    targetType: r.targetType,
    targetId: r.targetId,
    targetLabel,
    reason: r.reason,
    details: r.details,
    status: r.status,
    reporter: r.reporter ? toPublicUser(r.reporter) : null,
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
  };
}

export function toNotificationDto(n: Notification): NotificationDto {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
    metadata: (n.metadata as Record<string, string>) ?? {},
  };
}

export function paginated<T>(
  items: T[],
  page: number,
  perPage: number,
  total: number,
): PaginatedDto<T> {
  return { items, page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) };
}

export function toGameSaveDto(s: GameSave): GameSaveDto {
  return {
    gameId: s.gameId,
    data: s.data,
    schemaVersion: s.schemaVersion,
    sizeBytes: s.sizeBytes,
    dataHash: s.dataHash,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

/** Metadata-only view (no payload) for the saves-list endpoint. */
export function toGameSaveSummary(s: {
  gameId: string;
  schemaVersion: number;
  sizeBytes: number;
  dataHash: string;
  createdAt: Date;
  updatedAt: Date;
}): GameSaveSummaryDto {
  return {
    gameId: s.gameId,
    schemaVersion: s.schemaVersion,
    sizeBytes: s.sizeBytes,
    dataHash: s.dataHash,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}
