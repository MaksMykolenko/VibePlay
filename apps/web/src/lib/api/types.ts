import type {
  AnalyticsEventBatchInput,
  AnalyticsEventInput,
  AuditLogEntryDto,
  AvatarUploadIntentResponseDto,
  BillingMeDto,
  NotificationPrefsDto,
  CommentDto,
  CurrentUserDto,
  CreatorAnalyticsDto,
  CreatorAnalyticsRange,
  GameDetailDto,
  GameControlDto,
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

export interface CreateRoomInput {
  maxPlayers?: number;
  visibility?: 'PRIVATE' | 'PUBLIC';
  mode?: string;
  /** Guest-chosen display name (logged-in users use their account name). */
  displayName?: string;
}

export interface RegisterInput {
  email: string;
  username: string;
  displayName: string;
  password: string;
  inviteCode?: string;
  returnTo?: string;
  acceptTerms: true;
}

export interface GamesListParams {
  page?: number;
  perPage?: number;
  category?: string;
  sort?: string;
  featured?: boolean;
  q?: string;
  creator?: string;
}

export interface ProfileResponse {
  profile: PublicUserDto;
  status: string;
  stats: { publishedCount: number; likesReceived: number };
  games: GameListItemDto[];
}

export interface LibraryResponse {
  likes: GameListItemDto[];
  favorites: GameListItemDto[];
}

export interface RecentlyPlayedEntry {
  game: GameListItemDto;
  lastPlayedAt: string;
}

export interface CreatorGameSummary {
  game: GameDetailDto;
  versions: GameVersionDto[];
}

export interface CreateGameInput {
  title: string;
  shortDescription: string;
  description: string;
  category: string;
  ageRating?: string;
  tags?: string[];
  devices?: string[];
  controls?: GameControlDto[];
  multiplayer?: boolean;
  multiplayerEnabled?: boolean;
  multiplayerMaxPlayers?: number;
  multiplayerTransport?: 'NONE' | 'EXTERNAL_WS' | 'VIBEPLAY_SDK';
  multiplayerWsUrl?: string | null;
  multiplayerModes?: string[];
  aiDisclosure?: string;
  toolsUsed?: string[];
  coverUrl?: string | null;
  screenshots?: string[];
}

export interface CreateVersionInput {
  version: string;
  changelog?: string;
  aiDisclosure?: string;
  toolsUsed?: string[];
}

export interface UploadIntentInput {
  versionId: string;
  fileName: string;
  fileSize: number;
  contentType: 'application/zip';
  sha256: string;
}

export interface CreateReportInput {
  targetType: 'GAME' | 'COMMENT' | 'USER';
  targetId: string;
  reason: string;
  details?: string;
}

export interface AdminUsersParams {
  page?: number;
  perPage?: number;
  q?: string;
  role?: string;
  status?: string;
}

export interface ModerationQueueEntry {
  version: GameVersionDto;
  game: GameDetailDto;
  priority: boolean;
}

export interface FeedbackItem {
  id: string;
  category: 'FEEDBACK' | 'BUG';
  status: 'OPEN' | 'RESOLVED';
  message: string;
  page: string;
  user: PublicUserDto | null;
  resolvedBy: PublicUserDto | null;
  resolvedAt: string | null;
  createdAt: string;
}

/**
 * The single API surface the UI talks to. Two implementations:
 * - HttpApiClient (real backend)
 * - DemoApiClient (GitHub Pages demo over localStorage; unsupported methods
 *   throw NOT_AVAILABLE_IN_DEMO and the UI says so honestly)
 */
export interface ApiClient {
  readonly mode: 'real' | 'demo';

  /** Demo build only: instant sign-in as the canonical demo account for a role. */
  demoLoginAs?(role: 'player' | 'creator' | 'admin'): Promise<CurrentUserDto>;

  // auth
  /** Public registration mode (invite-only vs open). Safe for unauthenticated UI. */
  authConfig(): Promise<{ inviteOnly: boolean }>;
  register(input: RegisterInput): Promise<CurrentUserDto>;
  login(email: string, password: string): Promise<CurrentUserDto>;
  logout(): Promise<void>;
  logoutAll(): Promise<void>;
  me(): Promise<CurrentUserDto | null>;
  listSessions(): Promise<SessionDto[]>;
  revokeSession(id: string): Promise<void>;
  verifyEmail(token: string): Promise<void>;
  resendVerification(): Promise<void>;
  forgotPassword(email: string): Promise<void>;
  resetPassword(token: string, password: string): Promise<void>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;

  // profile
  getProfile(username: string): Promise<ProfileResponse>;
  searchCreators(query: string): Promise<PublicUserDto[]>;
  updateProfile(patch: {
    displayName?: string;
    bio?: string;
    avatarUrl?: string | null;
  }): Promise<CurrentUserDto>;
  /** Avatar binary upload (3-step, same-origin; MinIO is never exposed). */
  avatarUploadIntent(input: {
    contentType: 'image/png' | 'image/jpeg' | 'image/webp';
    fileName: string;
    size: number;
  }): Promise<AvatarUploadIntentResponseDto>;
  uploadAvatarDirect(objectKey: string, token: string, file: File): Promise<{ objectKey: string }>;
  completeAvatar(objectKey: string): Promise<CurrentUserDto>;
  removeAvatar(): Promise<CurrentUserDto>;
  requestAccountDeletion(): Promise<string>;
  downloadDataExport(): Promise<unknown>;
  updateNotificationPrefs(prefs: NotificationPrefsDto): Promise<CurrentUserDto>;

  // catalog
  listGames(params: GamesListParams): Promise<PaginatedDto<GameListItemDto>>;
  getGame(slug: string): Promise<GameDetailDto>;
  listCategories(): Promise<{ name: string; count: number }[]>;

  // social
  likeGame(gameId: string): Promise<void>;
  unlikeGame(gameId: string): Promise<void>;
  favoriteGame(gameId: string): Promise<void>;
  unfavoriteGame(gameId: string): Promise<void>;
  getLibrary(): Promise<LibraryResponse>;
  getRecentlyPlayed(): Promise<RecentlyPlayedEntry[]>;

  // comments
  listComments(gameId: string, page?: number): Promise<PaginatedDto<CommentDto>>;
  createComment(gameId: string, body: string): Promise<CommentDto>;
  updateComment(commentId: string, body: string): Promise<CommentDto>;
  deleteComment(commentId: string): Promise<void>;

  // reports
  createReport(input: CreateReportInput): Promise<void>;

  // beta feedback
  submitFeedback(input: {
    category: 'FEEDBACK' | 'BUG';
    message: string;
    page?: string;
  }): Promise<void>;

  // billing
  billingMe(): Promise<BillingMeDto>;
  createBillingCheckout(): Promise<{ url: string }>;
  createBillingPortal(): Promise<{ url: string }>;

  // notifications
  listNotifications(): Promise<NotificationDto[]>;
  markNotificationRead(id: string): Promise<void>;
  markAllNotificationsRead(): Promise<void>;

  // launch
  launchGame(gameId: string): Promise<LaunchDescriptorDto>;
  endPlaySession(sessionId: string): Promise<void>;
  trackAnalyticsEvent(event: AnalyticsEventInput): Promise<void>;
  trackAnalyticsBatch(batch: AnalyticsEventBatchInput): Promise<void>;

  // multiplayer rooms (VibePlay-owned; works for logged-in users and guests)
  /** Create a room for a published, multiplayer-enabled game. */
  createRoom(gameId: string, input?: CreateRoomInput): Promise<CreateRoomResponseDto>;
  /** Public room info by code. */
  getRoom(roomCode: string): Promise<RoomDto>;
  /** Join (or rejoin) a room as the current user/guest. */
  joinRoom(roomCode: string, input?: { displayName?: string }): Promise<JoinRoomResponseDto>;
  /** Leave the room (host transfers; empty room expires). */
  leaveRoom(roomCode: string): Promise<LeaveRoomResponseDto>;
  /** Host-only: set the room ACTIVE and get the play URL. */
  startRoom(roomCode: string): Promise<StartRoomResponseDto>;
  /** Mint a fresh short-lived signed room token for the current player. */
  getRoomToken(roomCode: string): Promise<RoomTokenResponseDto>;

  // cloud saves (authenticated; the Play Page bridge calls these on the game's behalf)
  /** The caller's save for a game, or null when none exists (404). */
  getGameSave(gameId: string): Promise<GameSaveDto | null>;
  putGameSave(gameId: string, data: unknown, schemaVersion?: number): Promise<GameSaveDto>;
  deleteGameSave(gameId: string): Promise<void>;
  listGameSaves(): Promise<GameSaveSummaryDto[]>;

  // creator
  listMyGames(): Promise<CreatorGameSummary[]>;
  createGame(input: CreateGameInput): Promise<GameDetailDto>;
  getMyGame(gameId: string): Promise<CreatorGameSummary>;
  updateMyGame(gameId: string, patch: Partial<CreateGameInput>): Promise<GameDetailDto>;
  gameCoverUploadIntent(
    gameId: string,
    input: {
      contentType: 'image/png' | 'image/jpeg' | 'image/webp';
      fileName: string;
      size: number;
    },
  ): Promise<GameCoverUploadIntentResponseDto>;
  uploadGameCoverDirect(
    gameId: string,
    objectKey: string,
    token: string,
    file: File,
  ): Promise<{ objectKey: string }>;
  completeGameCover(gameId: string, objectKey: string): Promise<GameDetailDto>;
  removeGameCover(gameId: string): Promise<void>;
  createVersion(gameId: string, input: CreateVersionInput): Promise<GameVersionDto>;
  getVersion(versionId: string): Promise<GameVersionDto>;
  hideMyGame(gameId: string): Promise<void>;
  createUploadIntent(gameId: string, input: UploadIntentInput): Promise<UploadIntentResponseDto>;
  uploadZipDirect(uploadId: string, file: Blob): Promise<UploadStatusDto>;
  completeUpload(uploadId: string): Promise<UploadStatusDto>;
  getUploadStatus(uploadId: string): Promise<UploadStatusDto>;
  creatorAnalytics(range: CreatorAnalyticsRange): Promise<CreatorAnalyticsDto>;

  // admin
  adminModerationQueue(): Promise<ModerationQueueEntry[]>;
  adminGetVersion(versionId: string): Promise<ModerationQueueEntry>;
  adminApproveVersion(versionId: string, notes?: string): Promise<void>;
  adminRejectVersion(versionId: string, reason: string, notes?: string): Promise<void>;
  adminHideGame(gameId: string): Promise<void>;
  adminRestoreGame(gameId: string): Promise<void>;
  adminFeatureGame(gameId: string, category: string | null): Promise<void>;
  adminPreviewUrl(versionId: string): Promise<string>;
  adminListUsers(params: AdminUsersParams): Promise<PaginatedDto<CurrentUserDto>>;
  adminSuspendUser(userId: string, reason: string): Promise<void>;
  adminBanUser(userId: string, reason: string): Promise<void>;
  adminRestoreUser(userId: string): Promise<void>;
  adminPromoteCreator(userId: string): Promise<void>;
  adminListReports(params: { page?: number; status?: string }): Promise<PaginatedDto<ReportDto>>;
  adminResolveReport(reportId: string, status: string, note?: string): Promise<void>;
  adminListFeedback(params: {
    page?: number;
    status?: 'OPEN' | 'RESOLVED';
  }): Promise<PaginatedDto<FeedbackItem>>;
  adminResolveFeedback(feedbackId: string): Promise<void>;
  adminAuditLog(params: { page?: number }): Promise<PaginatedDto<AuditLogEntryDto>>;
  adminCreateInvite(input: {
    email?: string;
    role?: 'PLAYER' | 'CREATOR';
    expiresInDays?: number;
  }): Promise<InviteDto>;
  adminListInvites(): Promise<InviteDto[]>;
  adminStats(): Promise<Record<string, number>>;
}
