import { createContext, useContext } from 'react';
import type { ActivityLog, Comment, Game, Report } from '../types';

export interface LibraryState {
  favorites: string[];
  likes: string[];
  recentlyPlayed: { id: string; timestamp: string }[];
}

export interface GamesContextType {
  isLoading: boolean;
  games: Game[];
  comments: Comment[];
  reports: Report[];
  activityLogs: ActivityLog[];
  library: LibraryState;
  toggleLikeGame: (gameId: string, userId: string) => void;
  toggleFavoriteGame: (gameId: string, userId: string) => void;
  addRecentlyPlayed: (gameId: string, userId: string) => void;
  addComment: (
    gameId: string,
    userId: string,
    username: string,
    avatar: string,
    content: string,
  ) => void;
  likeComment: (commentId: string, userId: string) => void;
  deleteComment: (commentId: string) => void;
  submitReport: (
    reporterId: string,
    reporterName: string,
    targetType: 'game' | 'comment' | 'user',
    targetId: string,
    targetName: string,
    reason: string,
  ) => void;
  createGame: (
    gameData: Omit<
      Game,
      | 'id'
      | 'slug'
      | 'plays'
      | 'likes'
      | 'dislikes'
      | 'status'
      | 'updatedAt'
      | 'creatorId'
      | 'creatorName'
      | 'creatorAvatar'
    >,
    creatorId: string,
    creatorName: string,
    creatorAvatar: string,
  ) => Promise<Game>;
  updateGame: (gameId: string, updatedFields: Partial<Game>) => void;
  deleteGame: (gameId: string) => void;
  submitForReview: (gameId: string) => void;
  hideGame: (gameId: string) => void;
  publishGameDraft: (gameId: string) => void;
  approveGame: (gameId: string, adminId: string, adminName: string) => void;
  rejectGame: (gameId: string, reason: string, adminId: string, adminName: string) => void;
  toggleFeaturedGame: (
    gameId: string,
    category: 'hero' | 'trending' | 'editors_choice' | null,
    adminId: string,
    adminName: string,
  ) => void;
  resolveReport: (reportId: string) => void;
  dismissReport: (reportId: string) => void;
  suspendUserGames: (creatorId: string) => void;
  refreshGames: () => Promise<void>;
}

export const GamesContext = createContext<GamesContextType | undefined>(undefined);

export function useGames(): GamesContextType {
  const context = useContext(GamesContext);
  if (!context) throw new Error('useGames must be used within GamesProvider');
  return context;
}
