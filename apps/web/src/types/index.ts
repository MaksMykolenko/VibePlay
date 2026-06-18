export type UserRole = 'player' | 'creator' | 'admin' | 'owner';

export interface User {
  id: string;
  username: string;
  displayName: string;
  email: string;
  role: UserRole;
  bio: string;
  avatar: string;
  joinDate: string;
  followersCount: number;
  isSuspended?: boolean;
}

export type GameStatus = 'draft' | 'pending' | 'published' | 'rejected' | 'hidden';

export interface ChangelogItem {
  version: string;
  date: string;
  notes: string;
}

export interface Game {
  id: string;
  title: string;
  slug: string;
  creatorId: string;
  creatorName: string;
  creatorUsername?: string;
  creatorAvatar: string;
  shortDescription: string;
  fullDescription: string;
  category: string;
  tags: string[];
  plays: number;
  likes: number;
  dislikes: number;
  coverUrl: string;
  screenshots: string[];
  devices: string[];
  controls: string[];
  multiplayer: boolean;
  aiDisclosure: 'no' | 'assisted' | 'generated';
  aiTools: string[];
  status: GameStatus;
  rejectReason?: string;
  isFeatured?: boolean;
  featuredCategory?: 'hero' | 'trending' | 'editors_choice';
  version: string;
  updatedAt: string;
  changelog: ChangelogItem[];
  fileSize?: string; // e.g., '14.2 MB'
  fileName?: string; // e.g., 'neon-drift-v1.zip'
  moderationVersionId?: string;
  validationReport?: import('@vibeplay/shared').ValidationReportDto;
}

export interface Comment {
  id: string;
  gameId: string;
  userId: string;
  username: string;
  userAvatar: string;
  content: string;
  likes: number;
  userLiked?: boolean;
  timestamp: string;
}

export type NotificationType =
  | 'game_approved'
  | 'game_rejected'
  | 'new_comment'
  | 'game_featured'
  | 'moderation_message'
  | 'platform_announcement';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  timestamp: string;
  relatedSlug?: string;
}

export interface Report {
  id: string;
  reporterId: string;
  reporterName: string;
  targetType: 'game' | 'comment' | 'user';
  targetId: string;
  targetName: string; // Title of game, snippet of comment, or username
  reason: string;
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
  timestamp: string;
}

export interface ActivityLog {
  id: string;
  adminId: string;
  adminName: string;
  action: string; // e.g. "Approve Game", "Ban User", "Feature Game"
  targetType: string;
  targetId: string;
  targetName: string;
  timestamp: string;
  details?: string;
}
