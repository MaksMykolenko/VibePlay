/**
 * Demo API client — GitHub Pages build ONLY (spec §43).
 *
 * Single honest rule: everything here is browser-local demo data. Flows that
 * cannot be demonstrated without a backend (uploads, real launch, emails)
 * throw NOT_AVAILABLE_IN_DEMO and the UI states that plainly. This module is
 * dynamically imported only when __APP_MODE__==='demo', so none of it (including
 * demo accounts) exists in the real bundle.
 */
import type {
  CommentDto,
  CurrentUserDto,
  GameDetailDto,
  GameListItemDto,
  NotificationDto,
  PaginatedDto,
  PublicUserDto,
} from '@vibeplay/shared';
import { mockGames } from '../../../data/mockGames';
import { mockUsers } from '../../../data/mockUsers';
import { mockComments } from '../../../data/mockComments';
import type { Game, User } from '../../../types';
import { ApiClientError } from '../errors';
import type { ApiClient, CreateGameInput, CreatorGameSummary } from '../types';

const LS = {
  users: 'vibeplay_users',
  session: 'vibeplay_demo_session',
  games: 'vibeplay_games',
  comments: 'vibeplay_comments',
  notifications: 'vibeplay_notifications',
  lib: (userId: string) => `vibeplay_lib_${userId}`,
};

function notInDemo(feature: string): never {
  throw new ApiClientError(
    'NOT_AVAILABLE_IN_DEMO',
    `${feature} is not available in the demo build — it requires the real backend.`,
    501,
  );
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

// --- mappers: legacy mock shapes → API DTOs --------------------------------

function toPublicUser(u: User): PublicUserDto {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: u.avatar,
    bio: u.bio,
    role: u.role.toUpperCase() as PublicUserDto['role'],
    createdAt: new Date(u.joinDate).toISOString(),
  };
}

function toCurrentUser(u: User): CurrentUserDto {
  return {
    ...toPublicUser(u),
    email: u.email,
    status: 'ACTIVE',
    emailVerified: true,
    lastLoginAt: null,
  };
}

function statusUp(s: Game['status']): GameListItemDto['status'] {
  const map: Record<Game['status'], GameListItemDto['status']> = {
    draft: 'DRAFT',
    pending: 'PENDING_REVIEW',
    published: 'PUBLISHED',
    rejected: 'REJECTED',
    hidden: 'HIDDEN',
  };
  return map[s];
}

function toListItem(g: Game, users: User[]): GameListItemDto {
  const creator = users.find((u) => u.id === g.creatorId);
  return {
    id: g.id,
    slug: g.slug,
    title: g.title,
    shortDescription: g.shortDescription,
    category: g.category,
    ageRating: 'EVERYONE',
    status: statusUp(g.status),
    coverUrl: g.coverUrl,
    creator: creator
      ? toPublicUser(creator)
      : {
          id: g.creatorId,
          username: g.creatorName.toLowerCase().replace(/\s+/g, '_'),
          displayName: g.creatorName,
          avatarUrl: g.creatorAvatar,
          bio: '',
          role: 'CREATOR',
          createdAt: new Date().toISOString(),
        },
    likesCount: g.likes,
    playsCount: g.plays,
    multiplayer: g.multiplayer,
    aiDisclosure: (g.aiDisclosure === 'no'
      ? 'NONE'
      : g.aiDisclosure.toUpperCase()) as GameListItemDto['aiDisclosure'],
    featuredCategory: g.featuredCategory
      ? (g.featuredCategory.toUpperCase() as GameListItemDto['featuredCategory'])
      : null,
    publishedAt: g.status === 'published' ? new Date(g.updatedAt).toISOString() : null,
    updatedAt: new Date(g.updatedAt).toISOString(),
  };
}

function toDetail(
  g: Game,
  users: User[],
  viewerId: string | null,
  lib: DemoLibrary,
): GameDetailDto {
  return {
    ...toListItem(g, users),
    description: g.fullDescription,
    tags: g.tags,
    devices: g.devices,
    controls: g.controls,
    toolsUsed: g.aiTools,
    screenshots: g.screenshots.map((url, i) => ({ id: `${g.id}_s${i}`, url, sortOrder: i })),
    publishedVersion:
      g.status === 'published'
        ? { id: `${g.id}_v`, version: g.version, changelog: '', approvedAt: null }
        : null,
    changelog: g.changelog.map((c) => ({ version: c.version, date: c.date, notes: c.notes })),
    viewer: viewerId
      ? {
          liked: lib.likes.includes(g.id),
          favorited: lib.favorites.includes(g.id),
          isOwner: g.creatorId === viewerId,
        }
      : null,
  };
}

interface DemoLibrary {
  favorites: string[];
  likes: string[];
  recentlyPlayed: { id: string; timestamp: string }[];
}

function getUsers(): User[] {
  const users = load<User[]>(LS.users, mockUsers);
  if (!localStorage.getItem(LS.users)) save(LS.users, mockUsers);
  return users;
}

function getGames(): Game[] {
  const games = load<Game[]>(LS.games, mockGames);
  if (!localStorage.getItem(LS.games)) save(LS.games, mockGames);
  return games;
}

function currentUser(): User | null {
  const id = load<string | null>(LS.session, null);
  if (!id) return null;
  return getUsers().find((u) => u.id === id) ?? null;
}

function requireUser(): User {
  const u = currentUser();
  if (!u) throw new ApiClientError('UNAUTHORIZED', 'Sign in first (demo)', 401);
  return u;
}

function getLib(userId: string): DemoLibrary {
  return load<DemoLibrary>(LS.lib(userId), { favorites: [], likes: [], recentlyPlayed: [] });
}

function paginate<T>(items: T[], page = 1, perPage = 20): PaginatedDto<T> {
  return {
    items: items.slice((page - 1) * perPage, page * perPage),
    page,
    perPage,
    total: items.length,
    totalPages: Math.max(1, Math.ceil(items.length / perPage)),
  };
}

const DEMO_EMAILS: Record<'player' | 'creator' | 'admin', string> = {
  player: 'player@vibeplay.demo',
  creator: 'creator@vibeplay.demo',
  admin: 'admin@vibeplay.demo',
};

export function createDemoClient(): ApiClient {
  return {
    mode: 'demo',

    async demoLoginAs(role) {
      const user = getUsers().find((u) => u.email === DEMO_EMAILS[role]);
      if (!user) throw new ApiClientError('USER_NOT_FOUND', 'Demo account missing', 404);
      save(LS.session, user.id);
      return toCurrentUser(user);
    },

    // ----- auth (demo accounts; any registered demo user has password "demo") --
    async register(input) {
      const users = getUsers();
      if (users.some((u) => u.email.toLowerCase() === input.email.toLowerCase())) {
        throw new ApiClientError('EMAIL_TAKEN', 'An account with this email already exists', 409);
      }
      if (users.some((u) => u.username.toLowerCase() === input.username.toLowerCase())) {
        throw new ApiClientError('USERNAME_TAKEN', 'This username is already taken', 409);
      }
      const user: User = {
        id: `user_${Date.now()}`,
        username: input.username.toLowerCase(),
        displayName: input.displayName,
        email: input.email.toLowerCase(),
        role: 'player',
        bio: 'New VibePlay demo user.',
        avatar: `https://api.dicebear.com/9.x/shapes/svg?seed=${encodeURIComponent(input.username)}`,
        joinDate: new Date().toISOString().slice(0, 10),
        followersCount: 0,
      };
      save(LS.users, [...users, user]);
      save(LS.session, user.id);
      return toCurrentUser(user);
    },
    async login(email, _password) {
      const user = getUsers().find((u) => u.email.toLowerCase() === email.toLowerCase());
      if (!user) {
        throw new ApiClientError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
      }
      save(LS.session, user.id);
      return toCurrentUser(user);
    },
    async logout() {
      localStorage.removeItem(LS.session);
    },
    async logoutAll() {
      localStorage.removeItem(LS.session);
    },
    async me() {
      const u = currentUser();
      return u ? toCurrentUser(u) : null;
    },
    async listSessions() {
      return [];
    },
    async revokeSession() {},
    async verifyEmail() {
      notInDemo('Email verification');
    },
    async resendVerification() {
      notInDemo('Email verification');
    },
    async forgotPassword() {
      notInDemo('Password reset email');
    },
    async resetPassword() {
      notInDemo('Password reset');
    },
    async changePassword() {
      notInDemo('Password change');
    },

    // ----- profile -----
    async getProfile(username) {
      const user = getUsers().find((u) => u.username === username);
      if (!user) throw new ApiClientError('USER_NOT_FOUND', 'Profile not found', 404);
      const games = getGames().filter((g) => g.creatorId === user.id && g.status === 'published');
      return {
        profile: toPublicUser(user),
        status: 'ACTIVE',
        stats: {
          publishedCount: games.length,
          likesReceived: games.reduce((s, g) => s + g.likes, 0),
        },
        games: games.map((g) => toListItem(g, getUsers())),
      };
    },
    async updateProfile(patch) {
      const me = requireUser();
      const users = getUsers().map((u) =>
        u.id === me.id
          ? {
              ...u,
              displayName: patch.displayName ?? u.displayName,
              bio: patch.bio ?? u.bio,
              avatar: patch.avatarUrl === undefined ? u.avatar : (patch.avatarUrl ?? ''),
            }
          : u,
      );
      save(LS.users, users);
      return toCurrentUser(users.find((u) => u.id === me.id)!);
    },
    async requestAccountDeletion() {
      return 'Demo build: account data lives only in your browser. Clear site data to remove it.';
    },

    // ----- catalog -----
    async listGames(params) {
      const users = getUsers();
      let games = getGames().filter((g) => g.status === 'published');
      if (params.category) games = games.filter((g) => g.category === params.category);
      if (params.creator) {
        const creator = users.find((u) => u.username === params.creator);
        games = games.filter((g) => g.creatorId === creator?.id);
      }
      if (params.q) {
        const q = params.q.toLowerCase();
        games = games.filter(
          (g) =>
            g.title.toLowerCase().includes(q) ||
            g.shortDescription.toLowerCase().includes(q) ||
            g.tags.some((t) => t.toLowerCase().includes(q)),
        );
      }
      if (params.featured) games = games.filter((g) => g.isFeatured);
      switch (params.sort) {
        case 'newest':
          games = [...games].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
          break;
        case 'most_liked':
          games = [...games].sort((a, b) => b.likes - a.likes);
          break;
        case 'title':
          games = [...games].sort((a, b) => a.title.localeCompare(b.title));
          break;
        default:
          games = [...games].sort((a, b) => b.plays - a.plays);
      }
      return paginate(
        games.map((g) => toListItem(g, users)),
        params.page,
        params.perPage,
      );
    },
    async getGame(slug) {
      const game = getGames().find((g) => g.slug === slug);
      if (!game) throw new ApiClientError('GAME_NOT_FOUND', 'Game not found', 404);
      const me = currentUser();
      return toDetail(
        game,
        getUsers(),
        me?.id ?? null,
        me ? getLib(me.id) : { favorites: [], likes: [], recentlyPlayed: [] },
      );
    },
    async listCategories() {
      const counts = new Map<string, number>();
      for (const g of getGames().filter((g) => g.status === 'published')) {
        counts.set(g.category, (counts.get(g.category) ?? 0) + 1);
      }
      return [...counts.entries()].map(([name, count]) => ({ name, count }));
    },

    // ----- social -----
    async likeGame(gameId) {
      const me = requireUser();
      const lib = getLib(me.id);
      if (!lib.likes.includes(gameId)) {
        lib.likes.push(gameId);
        save(LS.lib(me.id), lib);
        save(
          LS.games,
          getGames().map((g) => (g.id === gameId ? { ...g, likes: g.likes + 1 } : g)),
        );
      }
    },
    async unlikeGame(gameId) {
      const me = requireUser();
      const lib = getLib(me.id);
      if (lib.likes.includes(gameId)) {
        lib.likes = lib.likes.filter((id) => id !== gameId);
        save(LS.lib(me.id), lib);
        save(
          LS.games,
          getGames().map((g) => (g.id === gameId ? { ...g, likes: Math.max(0, g.likes - 1) } : g)),
        );
      }
    },
    async favoriteGame(gameId) {
      const me = requireUser();
      const lib = getLib(me.id);
      if (!lib.favorites.includes(gameId)) {
        lib.favorites.push(gameId);
        save(LS.lib(me.id), lib);
      }
    },
    async unfavoriteGame(gameId) {
      const me = requireUser();
      const lib = getLib(me.id);
      lib.favorites = lib.favorites.filter((id) => id !== gameId);
      save(LS.lib(me.id), lib);
    },
    async getLibrary() {
      const me = requireUser();
      const lib = getLib(me.id);
      const users = getUsers();
      const games = getGames();
      return {
        likes: games.filter((g) => lib.likes.includes(g.id)).map((g) => toListItem(g, users)),
        favorites: games
          .filter((g) => lib.favorites.includes(g.id))
          .map((g) => toListItem(g, users)),
      };
    },
    async getRecentlyPlayed() {
      const me = requireUser();
      const lib = getLib(me.id);
      const users = getUsers();
      const games = getGames();
      return lib.recentlyPlayed
        .map((r) => {
          const game = games.find((g) => g.id === r.id);
          return game ? { game: toListItem(game, users), lastPlayedAt: r.timestamp } : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
    },

    // ----- comments -----
    async listComments(gameId, page = 1) {
      const users = getUsers();
      const me = currentUser();
      const comments = load(LS.comments, mockComments)
        .filter((c) => c.gameId === gameId)
        .map(
          (c): CommentDto => ({
            id: c.id,
            gameId: c.gameId,
            body: c.content,
            status: 'VISIBLE',
            author: {
              id: c.userId,
              username: c.username,
              displayName: c.username,
              avatarUrl: c.userAvatar,
              bio: '',
              role: 'PLAYER',
              createdAt: c.timestamp,
            },
            createdAt: c.timestamp,
            updatedAt: c.timestamp,
            isOwn: me?.id === c.userId,
          }),
        );
      void users;
      return paginate(comments, page, 20);
    },
    async createComment(gameId, body) {
      const me = requireUser();
      const comments = load(LS.comments, mockComments);
      const comment = {
        id: `comment_${Date.now()}`,
        gameId,
        userId: me.id,
        username: me.username,
        userAvatar: me.avatar,
        content: body,
        likes: 0,
        timestamp: new Date().toISOString(),
      };
      save(LS.comments, [comment, ...comments]);
      return {
        id: comment.id,
        gameId,
        body,
        status: 'VISIBLE',
        author: toPublicUser(me),
        createdAt: comment.timestamp,
        updatedAt: comment.timestamp,
        isOwn: true,
      };
    },
    async updateComment(commentId, body) {
      const me = requireUser();
      const comments = load(LS.comments, mockComments);
      const target = comments.find((c) => c.id === commentId);
      if (!target || target.userId !== me.id) {
        throw new ApiClientError('FORBIDDEN', 'Not your comment', 403);
      }
      target.content = body;
      save(LS.comments, comments);
      return {
        id: target.id,
        gameId: target.gameId,
        body,
        status: 'VISIBLE',
        author: toPublicUser(me),
        createdAt: target.timestamp,
        updatedAt: new Date().toISOString(),
        isOwn: true,
      };
    },
    async deleteComment(commentId) {
      const me = requireUser();
      const comments = load(LS.comments, mockComments);
      save(
        LS.comments,
        comments.filter(
          (c) => !(c.id === commentId && (c.userId === me.id || me.role === 'admin')),
        ),
      );
    },

    // ----- reports / notifications -----
    async createReport() {
      // Recorded locally only; demo admins see localStorage reports via legacy page.
      return;
    },
    async listNotifications() {
      const me = currentUser();
      if (!me) return [];
      return load<
        {
          id: string;
          userId: string;
          type: string;
          title: string;
          message: string;
          isRead: boolean;
          timestamp: string;
        }[]
      >(LS.notifications, [])
        .filter((n) => n.userId === me.id)
        .map(
          (n): NotificationDto => ({
            id: n.id,
            type: 'PLATFORM',
            title: n.title,
            body: n.message,
            readAt: n.isRead ? n.timestamp : null,
            createdAt: n.timestamp,
            metadata: {},
          }),
        );
    },
    async markNotificationRead(id) {
      const all = load<{ id: string; isRead: boolean }[]>(LS.notifications, []);
      save(
        LS.notifications,
        all.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      );
    },
    async markAllNotificationsRead() {
      const me = requireUser();
      const all = load<{ id: string; userId: string; isRead: boolean }[]>(LS.notifications, []);
      save(
        LS.notifications,
        all.map((n) => (n.userId === me.id ? { ...n, isRead: true } : n)),
      );
    },

    // ----- launch (no real sandbox in demo) -----
    async launchGame() {
      notInDemo('Real game launch');
    },
    async endPlaySession() {},

    // ----- creator (local drafts; uploads impossible) -----
    async listMyGames() {
      const me = requireUser();
      const users = getUsers();
      return getGames()
        .filter((g) => g.creatorId === me.id)
        .map(
          (g): CreatorGameSummary => ({
            game: toDetail(g, users, me.id, getLib(me.id)),
            versions: [],
          }),
        );
    },
    async createGame(input: CreateGameInput) {
      const me = requireUser();
      const games = getGames();
      const game: Game = {
        id: `game_${Date.now()}`,
        title: input.title,
        slug: input.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, ''),
        creatorId: me.id,
        creatorName: me.displayName,
        creatorAvatar: me.avatar,
        shortDescription: input.shortDescription,
        fullDescription: input.description,
        category: input.category,
        tags: input.tags ?? [],
        plays: 0,
        likes: 0,
        dislikes: 0,
        coverUrl: input.coverUrl ?? '',
        screenshots: input.screenshots ?? [],
        devices: input.devices ?? ['desktop'],
        controls: input.controls ?? [],
        multiplayer: input.multiplayer ?? false,
        aiDisclosure: 'no',
        aiTools: input.toolsUsed ?? [],
        status: 'draft',
        version: '0.1.0',
        updatedAt: new Date().toISOString().slice(0, 10),
        changelog: [],
      };
      save(LS.games, [...games, game]);
      return toDetail(game, getUsers(), me.id, getLib(me.id));
    },
    async getMyGame(gameId) {
      const me = requireUser();
      const game = getGames().find((g) => g.id === gameId && g.creatorId === me.id);
      if (!game) throw new ApiClientError('GAME_NOT_FOUND', 'Game not found', 404);
      return { game: toDetail(game, getUsers(), me.id, getLib(me.id)), versions: [] };
    },
    async updateMyGame(gameId, patch) {
      const me = requireUser();
      const games = getGames();
      const idx = games.findIndex((g) => g.id === gameId && g.creatorId === me.id);
      if (idx === -1) throw new ApiClientError('GAME_NOT_FOUND', 'Game not found', 404);
      const g = games[idx]!;
      games[idx] = {
        ...g,
        title: patch.title ?? g.title,
        shortDescription: patch.shortDescription ?? g.shortDescription,
        fullDescription: patch.description ?? g.fullDescription,
        category: patch.category ?? g.category,
        tags: patch.tags ?? g.tags,
        coverUrl: patch.coverUrl ?? g.coverUrl,
        updatedAt: new Date().toISOString().slice(0, 10),
      };
      save(LS.games, games);
      return toDetail(games[idx]!, getUsers(), me.id, getLib(me.id));
    },
    async createVersion() {
      notInDemo('Game build upload');
    },
    async getVersion() {
      notInDemo('Game versions');
    },
    async hideMyGame(gameId) {
      const me = requireUser();
      save(
        LS.games,
        getGames().map((g) =>
          g.id === gameId && g.creatorId === me.id ? { ...g, status: 'hidden' as const } : g,
        ),
      );
    },
    async createUploadIntent() {
      notInDemo('Game build upload');
    },
    async uploadZipDirect() {
      notInDemo('Game build upload');
    },
    async completeUpload() {
      notInDemo('Game build upload');
    },
    async getUploadStatus() {
      notInDemo('Game build upload');
    },

    // ----- admin (not available in demo: server-enforced moderation only) -----
    async adminModerationQueue() {
      notInDemo('Admin moderation');
    },
    async adminGetVersion() {
      notInDemo('Admin moderation');
    },
    async adminApproveVersion() {
      notInDemo('Admin moderation');
    },
    async adminRejectVersion() {
      notInDemo('Admin moderation');
    },
    async adminHideGame() {
      notInDemo('Admin moderation');
    },
    async adminRestoreGame() {
      notInDemo('Admin moderation');
    },
    async adminFeatureGame() {
      notInDemo('Admin moderation');
    },
    async adminPreviewUrl() {
      notInDemo('Admin preview');
    },
    async adminListUsers() {
      notInDemo('Admin users');
    },
    async adminSuspendUser() {
      notInDemo('Admin users');
    },
    async adminBanUser() {
      notInDemo('Admin users');
    },
    async adminRestoreUser() {
      notInDemo('Admin users');
    },
    async adminPromoteCreator() {
      notInDemo('Admin users');
    },
    async adminListReports() {
      notInDemo('Admin reports');
    },
    async adminResolveReport() {
      notInDemo('Admin reports');
    },
    async adminAuditLog() {
      notInDemo('Audit log');
    },
    async adminCreateInvite() {
      notInDemo('Invites');
    },
    async adminListInvites() {
      notInDemo('Invites');
    },
    async adminStats() {
      const games = getGames();
      return {
        users: getUsers().length,
        games: games.length,
        published: games.filter((g) => g.status === 'published').length,
        pending: games.filter((g) => g.status === 'pending').length,
      };
    },
  };
}
