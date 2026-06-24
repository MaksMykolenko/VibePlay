import type {
  AnalyticsEventBatchInput,
  AnalyticsEventInput,
  AuditLogEntryDto,
  AvatarUploadIntentResponseDto,
  BillingMeDto,
  CommentDto,
  CurrentUserDto,
  CreatorAnalyticsDto,
  CreatorAnalyticsRange,
  GameDetailDto,
  GameListItemDto,
  GameSaveDto,
  GameSaveSummaryDto,
  GameVersionDto,
  GameCoverUploadIntentResponseDto,
  InviteDto,
  LaunchDescriptorDto,
  NotificationDto,
  PaginatedDto,
  PublicUserDto,
  ReportDto,
  SessionDto,
  UploadIntentResponseDto,
  UploadStatusDto,
  CreateRoomResponseDto,
  JoinRoomResponseDto,
  LeaveRoomResponseDto,
  RoomDto,
  RoomTokenResponseDto,
  StartRoomResponseDto,
} from '@vibeplay/shared';
import { API_URL } from '../appMode';
import { ApiClientError } from './errors';
import type {
  AdminUsersParams,
  ApiClient,
  CreateGameInput,
  CreateReportInput,
  CreateVersionInput,
  CreatorGameSummary,
  FeedbackItem,
  GamesListParams,
  LibraryResponse,
  ModerationQueueEntry,
  ProfileResponse,
  RecentlyPlayedEntry,
  RegisterInput,
  UploadIntentInput,
} from './types';

function readCookie(name: string): string {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : '';
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  keepalive?: boolean;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET') {
    const csrf = readCookie('vp_csrf');
    if (csrf) headers['x-csrf-token'] = csrf;
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
      keepalive: opts.keepalive,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiClientError('NETWORK_ERROR', 'Network request failed', 0);
  }

  if (res.status === 204) return undefined as T;

  let json: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  if (!res.ok) {
    const errBody = (
      json as {
        error?: { code?: string; message?: string; requestId?: string; details?: unknown };
      } | null
    )?.error;
    throw new ApiClientError(
      (errBody?.code as ApiClientError['code']) ?? 'INTERNAL_ERROR',
      errBody?.message ?? `Request failed with status ${res.status}`,
      res.status,
      errBody?.requestId,
      errBody?.details,
    );
  }
  return json as T;
}

function qs(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

export function createHttpClient(): ApiClient {
  return {
    mode: 'real',

    // ----- auth -----
    async authConfig() {
      return request<{ inviteOnly: boolean }>('/auth/config');
    },
    async register(input: RegisterInput) {
      const r = await request<{ user: CurrentUserDto }>('/auth/register', {
        method: 'POST',
        body: input,
      });
      return r.user;
    },
    async login(email, password) {
      const r = await request<{ user: CurrentUserDto }>('/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      return r.user;
    },
    async logout() {
      await request('/auth/logout', { method: 'POST' });
    },
    async logoutAll() {
      await request('/auth/logout-all', { method: 'POST' });
    },
    async me() {
      try {
        const r = await request<{ user: CurrentUserDto }>('/auth/me');
        return r.user;
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 401) return null;
        throw err;
      }
    },
    async listSessions() {
      const r = await request<{ sessions: SessionDto[] }>('/auth/sessions');
      return r.sessions;
    },
    async revokeSession(id) {
      await request(`/auth/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
    async verifyEmail(token) {
      await request('/auth/verify-email', { method: 'POST', body: { token } });
    },
    async resendVerification() {
      await request('/auth/resend-verification', { method: 'POST', body: {} });
    },
    async forgotPassword(email) {
      await request('/auth/forgot-password', { method: 'POST', body: { email } });
    },
    async resetPassword(token, password) {
      await request('/auth/reset-password', { method: 'POST', body: { token, password } });
    },
    async changePassword(currentPassword, newPassword) {
      await request('/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      });
    },

    // ----- profile -----
    async getProfile(username) {
      return request<ProfileResponse>(`/profiles/${encodeURIComponent(username)}`);
    },
    async searchCreators(query) {
      const r = await request<{ creators: PublicUserDto[] }>(
        `/profiles${qs({ q: query, page: 1, perPage: 20 })}`,
      );
      return r.creators;
    },
    async updateProfile(patch) {
      const r = await request<{ user: CurrentUserDto }>('/profile', {
        method: 'PATCH',
        body: patch,
      });
      return r.user;
    },
    async avatarUploadIntent(input) {
      return request<AvatarUploadIntentResponseDto>('/me/avatar/upload-intent', {
        method: 'POST',
        body: input,
      });
    },
    async uploadAvatarDirect(objectKey, token, file) {
      // Same-origin raw-body PUT, like the ZIP upload: the browser sends the
      // image bytes to the API, which validates + stores them internally. We
      // send the CSRF token + session cookie so the mutation passes the guards.
      const csrf = readCookie('vp_csrf');
      const path = `/me/avatar/upload?key=${encodeURIComponent(objectKey)}&token=${encodeURIComponent(token)}`;
      let res: Response;
      try {
        res = await fetch(`${API_URL}${path}`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'content-type': file.type, 'x-csrf-token': csrf },
          body: file,
        });
      } catch {
        throw new ApiClientError('NETWORK_ERROR', 'Upload endpoint is unreachable', 0);
      }
      if (!res.ok) {
        let message = 'Avatar upload failed';
        let code = 'INTERNAL_ERROR';
        try {
          const body = (await res.json()) as { error?: { code?: string; message?: string } };
          if (body.error?.message) message = body.error.message;
          if (body.error?.code) code = body.error.code;
        } catch {
          /* non-JSON error body */
        }
        throw new ApiClientError(code as ApiClientError['code'], message, res.status);
      }
      return (await res.json()) as { objectKey: string };
    },
    async completeAvatar(objectKey) {
      const r = await request<{ user: CurrentUserDto }>('/me/avatar/complete', {
        method: 'POST',
        body: { objectKey },
      });
      return r.user;
    },
    async removeAvatar() {
      const r = await request<{ user: CurrentUserDto }>('/me/avatar', { method: 'DELETE' });
      return r.user;
    },
    async requestAccountDeletion() {
      const r = await request<{ message: string }>('/profile/delete-request', {
        method: 'POST',
        body: {},
      });
      return r.message;
    },
    async downloadDataExport() {
      return request<unknown>('/profile/export', {
        method: 'POST',
        body: {},
      });
    },
    async updateNotificationPrefs(prefs) {
      const r = await request<{ user: CurrentUserDto }>('/profile/notification-preferences', {
        method: 'PUT',
        body: prefs,
      });
      return r.user;
    },

    async submitFeedback(input) {
      await request('/feedback', { method: 'POST', body: input });
    },

    // ----- billing -----
    async billingMe() {
      return request<BillingMeDto>('/billing/me');
    },
    async createBillingCheckout() {
      return request<{ url: string }>('/billing/checkout', { method: 'POST', body: {} });
    },
    async createBillingPortal() {
      return request<{ url: string }>('/billing/portal', { method: 'POST', body: {} });
    },

    // ----- catalog -----
    async listGames(params: GamesListParams) {
      return request<PaginatedDto<GameListItemDto>>(`/games${qs({ ...params })}`);
    },
    async getGame(slug) {
      const r = await request<{ game: GameDetailDto }>(`/games/${encodeURIComponent(slug)}`);
      return r.game;
    },
    async listCategories() {
      const r = await request<{ categories: { name: string; count: number }[] }>('/categories');
      return r.categories;
    },

    // ----- social -----
    async likeGame(gameId) {
      await request(`/games/${gameId}/like`, { method: 'PUT' });
    },
    async unlikeGame(gameId) {
      await request(`/games/${gameId}/like`, { method: 'DELETE' });
    },
    async favoriteGame(gameId) {
      await request(`/games/${gameId}/favorite`, { method: 'PUT' });
    },
    async unfavoriteGame(gameId) {
      await request(`/games/${gameId}/favorite`, { method: 'DELETE' });
    },
    async getLibrary() {
      return request<LibraryResponse>('/library');
    },
    async getRecentlyPlayed() {
      const r = await request<{ items: RecentlyPlayedEntry[] }>('/recently-played');
      return r.items;
    },

    // ----- comments -----
    async listComments(gameId, page = 1) {
      return request<PaginatedDto<CommentDto>>(`/games/${gameId}/comments${qs({ page })}`);
    },
    async createComment(gameId, body) {
      const r = await request<{ comment: CommentDto }>(`/games/${gameId}/comments`, {
        method: 'POST',
        body: { body },
      });
      return r.comment;
    },
    async updateComment(commentId, body) {
      const r = await request<{ comment: CommentDto }>(`/comments/${commentId}`, {
        method: 'PATCH',
        body: { body },
      });
      return r.comment;
    },
    async deleteComment(commentId) {
      await request(`/comments/${commentId}`, { method: 'DELETE' });
    },

    // ----- reports -----
    async createReport(input: CreateReportInput) {
      await request('/reports', { method: 'POST', body: input });
    },

    // ----- notifications -----
    async listNotifications() {
      const r = await request<{ notifications: NotificationDto[] }>('/notifications');
      return r.notifications;
    },
    async markNotificationRead(id) {
      await request(`/notifications/${id}/read`, { method: 'PATCH' });
    },
    async markAllNotificationsRead() {
      await request('/notifications/read-all', { method: 'POST', body: {} });
    },

    // ----- launch -----
    async launchGame(gameId) {
      return request<LaunchDescriptorDto>(`/games/${gameId}/launch`, { method: 'POST', body: {} });
    },
    async endPlaySession(sessionId) {
      await request(`/play-sessions/${sessionId}/end`, { method: 'POST', body: {} });
    },
    async trackAnalyticsEvent(event: AnalyticsEventInput) {
      await request('/analytics/events', { method: 'POST', body: event, keepalive: true });
    },
    async trackAnalyticsBatch(batch: AnalyticsEventBatchInput) {
      await request('/analytics/batch', { method: 'POST', body: batch, keepalive: true });
    },

    // ----- multiplayer rooms -----
    async createRoom(gameId, input) {
      return request<CreateRoomResponseDto>(`/games/${encodeURIComponent(gameId)}/rooms`, {
        method: 'POST',
        body: input ?? {},
      });
    },
    async getRoom(roomCode) {
      const r = await request<{ room: RoomDto }>(`/rooms/${encodeURIComponent(roomCode)}`);
      return r.room;
    },
    async joinRoom(roomCode, input) {
      return request<JoinRoomResponseDto>(`/rooms/${encodeURIComponent(roomCode)}/join`, {
        method: 'POST',
        body: input ?? {},
      });
    },
    async leaveRoom(roomCode) {
      return request<LeaveRoomResponseDto>(`/rooms/${encodeURIComponent(roomCode)}/leave`, {
        method: 'POST',
        body: {},
      });
    },
    async startRoom(roomCode) {
      return request<StartRoomResponseDto>(`/rooms/${encodeURIComponent(roomCode)}/start`, {
        method: 'POST',
        body: {},
      });
    },
    async getRoomToken(roomCode) {
      return request<RoomTokenResponseDto>(`/rooms/${encodeURIComponent(roomCode)}/token`, {
        method: 'POST',
        body: {},
      });
    },

    // ----- cloud saves -----
    async getGameSave(gameId) {
      try {
        const r = await request<{ save: GameSaveDto }>(
          `/me/game-saves/${encodeURIComponent(gameId)}`,
        );
        return r.save;
      } catch (err) {
        // No save yet is a normal, non-exceptional state for the caller.
        if (err instanceof ApiClientError && err.status === 404) return null;
        throw err;
      }
    },
    async putGameSave(gameId, data, schemaVersion) {
      const r = await request<{ save: GameSaveDto }>(
        `/me/game-saves/${encodeURIComponent(gameId)}`,
        { method: 'PUT', body: { data, schemaVersion } },
      );
      return r.save;
    },
    async deleteGameSave(gameId) {
      await request(`/me/game-saves/${encodeURIComponent(gameId)}`, { method: 'DELETE' });
    },
    async listGameSaves() {
      const r = await request<{ saves: GameSaveSummaryDto[] }>('/me/game-saves');
      return r.saves;
    },

    // ----- creator -----
    async listMyGames() {
      const r = await request<{ games: CreatorGameSummary[] }>('/creator/games');
      return r.games;
    },
    async createGame(input: CreateGameInput) {
      const r = await request<{ game: GameDetailDto }>('/creator/games', {
        method: 'POST',
        body: input,
      });
      return r.game;
    },
    async getMyGame(gameId) {
      return request<CreatorGameSummary>(`/creator/games/${gameId}`);
    },
    async updateMyGame(gameId, patch) {
      const r = await request<{ game: GameDetailDto }>(`/creator/games/${gameId}`, {
        method: 'PATCH',
        body: patch,
      });
      return r.game;
    },
    async gameCoverUploadIntent(gameId, input) {
      return request<GameCoverUploadIntentResponseDto>(
        `/creator/games/${encodeURIComponent(gameId)}/cover/upload-intent`,
        { method: 'POST', body: input },
      );
    },
    async uploadGameCoverDirect(gameId, objectKey, token, file) {
      const csrf = readCookie('vp_csrf');
      const path = `/creator/games/${encodeURIComponent(gameId)}/cover/upload?key=${encodeURIComponent(objectKey)}&token=${encodeURIComponent(token)}`;
      let res: Response;
      try {
        res = await fetch(`${API_URL}${path}`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'content-type': file.type, 'x-csrf-token': csrf },
          body: file,
        });
      } catch {
        throw new ApiClientError('NETWORK_ERROR', 'Game cover upload endpoint is unreachable', 0);
      }
      if (!res.ok) {
        let message = 'Game cover upload failed';
        let code = 'INTERNAL_ERROR';
        try {
          const body = (await res.json()) as { error?: { code?: string; message?: string } };
          if (body.error?.message) message = body.error.message;
          if (body.error?.code) code = body.error.code;
        } catch {
          /* non-JSON error body */
        }
        throw new ApiClientError(code as ApiClientError['code'], message, res.status);
      }
      return (await res.json()) as { objectKey: string };
    },
    async completeGameCover(gameId, objectKey) {
      const response = await request<{ game: GameDetailDto }>(
        `/creator/games/${encodeURIComponent(gameId)}/cover/complete`,
        { method: 'POST', body: { objectKey } },
      );
      return response.game;
    },
    async removeGameCover(gameId) {
      await request(`/creator/games/${encodeURIComponent(gameId)}/cover`, { method: 'DELETE' });
    },
    async createVersion(gameId, input: CreateVersionInput) {
      const r = await request<{ version: GameVersionDto }>(`/creator/games/${gameId}/versions`, {
        method: 'POST',
        body: input,
      });
      return r.version;
    },
    async getVersion(versionId) {
      const r = await request<{ version: GameVersionDto }>(`/creator/game-versions/${versionId}`);
      return r.version;
    },
    async hideMyGame(gameId) {
      await request(`/creator/games/${gameId}/hide`, { method: 'POST', body: {} });
    },
    async createUploadIntent(gameId, input: UploadIntentInput) {
      return request<UploadIntentResponseDto>(`/creator/games/${gameId}/upload-intent`, {
        method: 'POST',
        body: input,
      });
    },
    async uploadZipDirect(uploadId, file) {
      // Same-origin raw-body PUT. The browser uploads the ZIP to the API, which
      // stores it into MinIO internally and enqueues validation — the browser
      // never talks to MinIO. We send the CSRF token + session cookie so the
      // mutation passes the auth/CSRF guards.
      const csrf = readCookie('vp_csrf');
      let res: Response;
      try {
        res = await fetch(`${API_URL}/uploads/${uploadId}/direct`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'content-type': 'application/zip', 'x-csrf-token': csrf },
          body: file,
        });
      } catch {
        // fetch rejects only on a network-level failure (endpoint unreachable,
        // offline, DNS/CORS) — surface a clear, actionable message.
        throw new ApiClientError('NETWORK_ERROR', 'Upload endpoint is unreachable', 0);
      }
      if (!res.ok) {
        throw new ApiClientError('INTERNAL_ERROR', 'Upload failed', res.status);
      }
      return (await res.json()) as UploadStatusDto;
    },
    async completeUpload(uploadId) {
      return request<UploadStatusDto>(`/uploads/${uploadId}/complete`, {
        method: 'POST',
        body: {},
      });
    },
    async getUploadStatus(uploadId) {
      return request<UploadStatusDto>(`/uploads/${uploadId}/status`);
    },
    async creatorAnalytics(range: CreatorAnalyticsRange) {
      return request<CreatorAnalyticsDto>(`/creator/analytics${qs({ range })}`);
    },

    // ----- admin -----
    async adminModerationQueue() {
      const r = await request<{ queue: ModerationQueueEntry[] }>('/admin/moderation');
      return r.queue;
    },
    async adminGetVersion(versionId) {
      return request<ModerationQueueEntry>(`/admin/game-versions/${versionId}`);
    },
    async adminApproveVersion(versionId, notes) {
      await request(`/admin/game-versions/${versionId}/approve`, {
        method: 'POST',
        body: { notes: notes ?? '' },
      });
    },
    async adminRejectVersion(versionId, reason, notes) {
      await request(`/admin/game-versions/${versionId}/reject`, {
        method: 'POST',
        body: { reason, notes: notes ?? '' },
      });
    },
    async adminHideGame(gameId) {
      await request(`/admin/games/${gameId}/hide`, { method: 'POST', body: {} });
    },
    async adminRestoreGame(gameId) {
      await request(`/admin/games/${gameId}/restore`, { method: 'POST', body: {} });
    },
    async adminFeatureGame(gameId, category) {
      await request(`/admin/games/${gameId}/feature`, { method: 'POST', body: { category } });
    },
    async adminPreviewUrl(versionId) {
      const r = await request<{ url: string }>(`/admin/game-versions/${versionId}/preview-url`, {
        method: 'POST',
        body: {},
      });
      return r.url;
    },
    async adminListUsers(params: AdminUsersParams) {
      return request<PaginatedDto<CurrentUserDto>>(`/admin/users${qs({ ...params })}`);
    },
    async adminSuspendUser(userId, reason) {
      await request(`/admin/users/${userId}/suspend`, { method: 'POST', body: { reason } });
    },
    async adminBanUser(userId, reason) {
      await request(`/admin/users/${userId}/ban`, { method: 'POST', body: { reason } });
    },
    async adminRestoreUser(userId) {
      await request(`/admin/users/${userId}/restore`, { method: 'POST', body: {} });
    },
    async adminPromoteCreator(userId) {
      await request(`/admin/users/${userId}/promote-creator`, { method: 'POST', body: {} });
    },
    async adminListReports(params) {
      return request<PaginatedDto<ReportDto>>(`/admin/reports${qs({ ...params })}`);
    },
    async adminResolveReport(reportId, status, note) {
      await request(`/admin/reports/${reportId}/resolve`, {
        method: 'POST',
        body: { status, note: note ?? '' },
      });
    },
    async adminListFeedback(params) {
      return request<PaginatedDto<FeedbackItem>>(`/admin/feedback${qs({ ...params })}`);
    },
    async adminResolveFeedback(feedbackId) {
      await request(`/admin/feedback/${feedbackId}/resolve`, { method: 'POST', body: {} });
    },
    async adminAuditLog(params) {
      return request<PaginatedDto<AuditLogEntryDto>>(`/admin/audit-log${qs({ ...params })}`);
    },
    async adminCreateInvite(input) {
      const r = await request<{ invite: InviteDto }>('/admin/invites', {
        method: 'POST',
        body: input,
      });
      return r.invite;
    },
    async adminListInvites() {
      const r = await request<{ invites: InviteDto[] }>('/admin/invites');
      return r.invites;
    },
    async adminStats() {
      const r = await request<{ stats: Record<string, number> }>('/admin/stats');
      return r.stats;
    },
  };
}
