import React, { useCallback, useEffect, useState } from 'react';
import type {
  AuditLogEntryDto,
  CommentDto,
  GameDetailDto,
  GameListItemDto,
  ReportDto,
} from '@vibeplay/shared';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api/errors';
import type { ActivityLog, Comment, Game, GameStatus, Report } from '../types';
import { toast } from '../components/toastEvents';
import { useAuth } from './useAuth';
import { GamesContext, type GamesContextType, type LibraryState } from './gamesContext';

function gameStatus(status: GameListItemDto['status']): GameStatus {
  if (status === 'PUBLISHED') return 'published';
  if (status === 'PENDING_REVIEW') return 'pending';
  if (status === 'REJECTED') return 'rejected';
  if (status === 'HIDDEN' || status === 'SUSPENDED') return 'hidden';
  return 'draft';
}

function toGame(dto: GameListItemDto | GameDetailDto): Game {
  const detail = dto as Partial<GameDetailDto>;
  return {
    id: dto.id,
    title: dto.title,
    slug: dto.slug,
    creatorId: dto.creator.id,
    creatorName: dto.creator.displayName,
    creatorUsername: dto.creator.username,
    creatorAvatar: dto.creator.avatarUrl ?? '',
    shortDescription: dto.shortDescription,
    fullDescription: detail.description ?? dto.shortDescription,
    category: dto.category,
    tags: detail.tags ?? [],
    plays: dto.playsCount,
    likes: dto.likesCount,
    dislikes: 0,
    coverUrl: dto.coverUrl ?? '',
    screenshots: detail.screenshots?.map((screenshot) => screenshot.url) ?? [],
    devices: detail.devices ?? ['desktop'],
    controls: detail.controls ?? [],
    multiplayer: dto.multiplayer,
    aiDisclosure:
      dto.aiDisclosure === 'NONE'
        ? 'no'
        : dto.aiDisclosure === 'ASSISTED'
          ? 'assisted'
          : 'generated',
    aiTools: detail.toolsUsed ?? [],
    status: gameStatus(dto.status),
    isFeatured: dto.featuredCategory != null,
    featuredCategory: dto.featuredCategory?.toLowerCase() as Game['featuredCategory'],
    version: detail.publishedVersion?.version ?? '0.0.0',
    updatedAt: dto.updatedAt,
    changelog:
      detail.changelog?.map((entry) => ({
        version: entry.version,
        date: entry.date,
        notes: entry.notes,
      })) ?? [],
  };
}

function toComment(dto: CommentDto): Comment {
  return {
    id: dto.id,
    gameId: dto.gameId,
    userId: dto.author.id,
    username: dto.author.username,
    userAvatar: dto.author.avatarUrl ?? '',
    content: dto.body,
    likes: 0,
    timestamp: dto.createdAt,
  };
}

function toReport(dto: ReportDto): Report {
  return {
    id: dto.id,
    reporterId: dto.reporter?.id ?? '',
    reporterName: dto.reporter?.displayName ?? 'Deleted user',
    targetType: dto.targetType.toLowerCase() as Report['targetType'],
    targetId: dto.targetId,
    targetName: dto.targetLabel,
    reason: dto.reason,
    status: dto.status.toLowerCase() as Report['status'],
    timestamp: dto.createdAt,
  };
}

function toActivity(dto: AuditLogEntryDto): ActivityLog {
  return {
    id: dto.id,
    adminId: dto.actor?.id ?? '',
    adminName: dto.actor?.displayName ?? 'System',
    action: dto.action,
    targetType: dto.targetType,
    targetId: dto.targetId,
    targetName: String(dto.metadata.targetName ?? dto.targetId),
    timestamp: dto.createdAt,
    details: JSON.stringify(dto.metadata),
  };
}

const EMPTY_LIBRARY: LibraryState = { favorites: [], likes: [], recentlyPlayed: [] };

export const RealGamesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [games, setGames] = useState<Game[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [library, setLibrary] = useState<LibraryState>(EMPTY_LIBRARY);
  const [moderationVersions, setModerationVersions] = useState<Record<string, string>>({});

  const refreshGames = useCallback(async () => {
    const catalog = await api.listGames({ page: 1, perPage: 50, sort: 'newest' });
    const gameMap = new Map(catalog.items.map((game) => [game.id, toGame(game)]));
    const nextVersionMap: Record<string, string> = {};

    const isModerator = currentUser?.role === 'admin' || currentUser?.role === 'owner';

    if (currentUser?.role === 'creator' || isModerator) {
      const owned = await api.listMyGames();
      for (const item of owned) gameMap.set(item.game.id, toGame(item.game));
    }

    if (isModerator) {
      const [queue, reportPage, auditPage] = await Promise.all([
        api.adminModerationQueue(),
        api.adminListReports({ page: 1 }),
        api.adminAuditLog({ page: 1 }),
      ]);
      for (const item of queue) {
        gameMap.set(item.game.id, {
          ...toGame(item.game),
          status: 'pending',
          version: item.version.version,
          fileSize:
            item.version.compressedSize === null
              ? undefined
              : `${(item.version.compressedSize / (1024 * 1024)).toFixed(1)} MB`,
          moderationVersionId: item.version.id,
          validationReport: item.version.validationReport ?? undefined,
        });
        nextVersionMap[item.game.id] = item.version.id;
      }
      setReports(reportPage.items.map(toReport));
      setActivityLogs(auditPage.items.map(toActivity));
    } else {
      setReports([]);
      setActivityLogs([]);
    }

    const nextGames = [...gameMap.values()];
    setGames(nextGames);
    setModerationVersions(nextVersionMap);

    const commentPages = await Promise.all(
      catalog.items.slice(0, 20).map((game) => api.listComments(game.id, 1)),
    );
    setComments(commentPages.flatMap((page) => page.items.map(toComment)));

    if (currentUser) {
      const [storedLibrary, recent] = await Promise.all([
        api.getLibrary(),
        api.getRecentlyPlayed(),
      ]);
      setLibrary({
        likes: storedLibrary.likes.map((game) => game.id),
        favorites: storedLibrary.favorites.map((game) => game.id),
        recentlyPlayed: recent.map((entry) => ({
          id: entry.game.id,
          timestamp: entry.lastPlayedAt,
        })),
      });
    } else {
      setLibrary(EMPTY_LIBRARY);
    }
  }, [currentUser]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void refreshGames()
        .catch((error) => {
          if (active) toast.danger(errorMessage(error));
        })
        .finally(() => {
          if (active) setIsLoading(false);
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [refreshGames]);

  const run = (operation: () => Promise<unknown>, refresh = true): void => {
    void operation()
      .then(() => (refresh ? refreshGames() : undefined))
      .catch((error) => toast.danger(errorMessage(error)));
  };

  const value: GamesContextType = {
    isLoading,
    games,
    comments,
    reports,
    activityLogs,
    library,
    toggleLikeGame(gameId) {
      const liked = library.likes.includes(gameId);
      run(() => (liked ? api.unlikeGame(gameId) : api.likeGame(gameId)));
    },
    toggleFavoriteGame(gameId) {
      const favorited = library.favorites.includes(gameId);
      run(() => (favorited ? api.unfavoriteGame(gameId) : api.favoriteGame(gameId)));
    },
    addRecentlyPlayed(gameId) {
      run(async () => {
        const launch = await api.launchGame(gameId);
        await api.endPlaySession(launch.sessionId);
      });
    },
    addComment(gameId, _userId, _username, _avatar, content) {
      run(() => api.createComment(gameId, content));
    },
    likeComment() {
      toast.info('Comment likes are not part of the private beta API.');
    },
    deleteComment(commentId) {
      run(() => api.deleteComment(commentId));
    },
    submitReport(_reporterId, _reporterName, targetType, targetId, _targetName, reason) {
      run(
        () =>
          api.createReport({
            targetType: targetType.toUpperCase() as 'GAME' | 'COMMENT' | 'USER',
            targetId,
            reason: 'OTHER',
            details: reason,
          }),
        false,
      );
    },
    async createGame(gameData) {
      const created = await api.createGame({
        title: gameData.title,
        shortDescription: gameData.shortDescription,
        description: gameData.fullDescription,
        category: gameData.category,
        tags: gameData.tags,
        devices: gameData.devices,
        controls: gameData.controls,
        multiplayer: gameData.multiplayer,
        aiDisclosure:
          gameData.aiDisclosure === 'no'
            ? 'NONE'
            : gameData.aiDisclosure === 'assisted'
              ? 'ASSISTED'
              : 'GENERATED',
        toolsUsed: gameData.aiTools,
        coverUrl: gameData.coverUrl || null,
        screenshots: gameData.screenshots,
      });
      await refreshGames();
      return toGame(created);
    },
    updateGame(gameId, fields) {
      run(() =>
        api.updateMyGame(gameId, {
          ...(fields.title !== undefined ? { title: fields.title } : {}),
          ...(fields.shortDescription !== undefined
            ? { shortDescription: fields.shortDescription }
            : {}),
          ...(fields.fullDescription !== undefined ? { description: fields.fullDescription } : {}),
          ...(fields.category !== undefined ? { category: fields.category } : {}),
          ...(fields.tags !== undefined ? { tags: fields.tags } : {}),
          ...(fields.devices !== undefined ? { devices: fields.devices } : {}),
          ...(fields.controls !== undefined ? { controls: fields.controls } : {}),
          ...(fields.multiplayer !== undefined ? { multiplayer: fields.multiplayer } : {}),
          ...(fields.coverUrl !== undefined ? { coverUrl: fields.coverUrl || null } : {}),
          ...(fields.screenshots !== undefined ? { screenshots: fields.screenshots } : {}),
        }),
      );
    },
    deleteGame(gameId) {
      run(() => api.hideMyGame(gameId));
    },
    submitForReview() {
      toast.info('Submit a ZIP build to enter moderation.');
    },
    hideGame(gameId) {
      run(() => api.hideMyGame(gameId));
    },
    publishGameDraft() {
      toast.info('Only an administrator can publish a validated build.');
    },
    approveGame(gameId) {
      const versionId = moderationVersions[gameId];
      if (!versionId) return;
      run(() => api.adminApproveVersion(versionId));
    },
    rejectGame(gameId, reason) {
      const versionId = moderationVersions[gameId];
      if (!versionId) return;
      run(() => api.adminRejectVersion(versionId, reason));
    },
    toggleFeaturedGame(gameId, category) {
      run(() =>
        api.adminFeatureGame(
          gameId,
          category === 'editors_choice' ? 'EDITORS_CHOICE' : (category?.toUpperCase() ?? null),
        ),
      );
    },
    resolveReport(reportId) {
      run(() => api.adminResolveReport(reportId, 'RESOLVED'));
    },
    dismissReport(reportId) {
      run(() => api.adminResolveReport(reportId, 'DISMISSED'));
    },
    suspendUserGames(creatorId) {
      run(() => api.adminSuspendUser(creatorId, 'Suspended by administrator'));
    },
    refreshGames,
  };

  return <GamesContext.Provider value={value}>{children}</GamesContext.Provider>;
};
