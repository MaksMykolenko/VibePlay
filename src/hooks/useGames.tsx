import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Game, Comment, Report, ActivityLog, GameStatus } from '../types';
import { mockGames } from '../data/mockGames';
import { mockComments } from '../data/mockComments';
import { mockReports } from '../data/mockReports';
import { mockActivityLogs } from '../data/mockActivityLog';

interface LibraryState {
  favorites: string[];
  likes: string[];
  recentlyPlayed: { id: string; timestamp: string }[];
}

interface GamesContextType {
  games: Game[];
  comments: Comment[];
  reports: Report[];
  activityLogs: ActivityLog[];
  library: LibraryState;
  
  // Player Actions
  toggleLikeGame: (gameId: string, userId: string) => void;
  toggleFavoriteGame: (gameId: string, userId: string) => void;
  addRecentlyPlayed: (gameId: string, userId: string) => void;
  addComment: (gameId: string, userId: string, username: string, avatar: string, content: string) => void;
  likeComment: (commentId: string, userId: string) => void;
  deleteComment: (commentId: string) => void;
  submitReport: (reporterId: string, reporterName: string, targetType: 'game' | 'comment' | 'user', targetId: string, targetName: string, reason: string) => void;

  // Creator Actions
  createGame: (gameData: Omit<Game, 'id' | 'slug' | 'plays' | 'likes' | 'dislikes' | 'status' | 'updatedAt' | 'creatorId' | 'creatorName' | 'creatorAvatar'>, creatorId: string, creatorName: string, creatorAvatar: string) => Game;
  updateGame: (gameId: string, updatedFields: Partial<Game>) => void;
  deleteGame: (gameId: string) => void;
  submitForReview: (gameId: string) => void;
  hideGame: (gameId: string) => void;
  publishGameDraft: (gameId: string) => void;

  // Admin Actions
  approveGame: (gameId: string, adminId: string, adminName: string) => void;
  rejectGame: (gameId: string, reason: string, adminId: string, adminName: string) => void;
  toggleFeaturedGame: (gameId: string, category: 'hero' | 'trending' | 'editors_choice' | null, adminId: string, adminName: string) => void;
  resolveReport: (reportId: string) => void;
  dismissReport: (reportId: string) => void;
  suspendUserGames: (creatorId: string) => void;
}

const GamesContext = createContext<GamesContextType | undefined>(undefined);

export const GamesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [games, setGames] = useState<Game[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  
  // Library is keyed by userId in localStorage (e.g. vibeplay_lib_user_1)
  const [library, setLibrary] = useState<LibraryState>({ favorites: [], likes: [], recentlyPlayed: [] });
  const [activeUserId, setActiveUserId] = useState<string | null>(null);

  // Initial Load from localStorage or mockData
  useEffect(() => {
    // Games
    const storedGames = localStorage.getItem('vibeplay_games');
    if (storedGames) {
      setGames(JSON.parse(storedGames));
    } else {
      setGames(mockGames);
      localStorage.setItem('vibeplay_games', JSON.stringify(mockGames));
    }

    // Comments
    const storedComments = localStorage.getItem('vibeplay_comments');
    if (storedComments) {
      setComments(JSON.parse(storedComments));
    } else {
      setComments(mockComments);
      localStorage.setItem('vibeplay_comments', JSON.stringify(mockComments));
    }

    // Reports
    const storedReports = localStorage.getItem('vibeplay_reports');
    if (storedReports) {
      setReports(JSON.parse(storedReports));
    } else {
      setReports(mockReports);
      localStorage.setItem('vibeplay_reports', JSON.stringify(mockReports));
    }

    // Admin Logs
    const storedLogs = localStorage.getItem('vibeplay_activity_logs');
    if (storedLogs) {
      setActivityLogs(JSON.parse(storedLogs));
    } else {
      setActivityLogs(mockActivityLogs);
      localStorage.setItem('vibeplay_activity_logs', JSON.stringify(mockActivityLogs));
    }
  }, []);

  // Listen to active user changes to load correct library
  useEffect(() => {
    const handleUserChange = () => {
      const storedUser = localStorage.getItem('vibeplay_current_user');
      if (storedUser) {
        const user = JSON.parse(storedUser);
        setActiveUserId(user.id);
        
        const libKey = `vibeplay_lib_${user.id}`;
        const storedLib = localStorage.getItem(libKey);
        if (storedLib) {
          setLibrary(JSON.parse(storedLib));
        } else {
          const initialLib = { favorites: [], likes: [], recentlyPlayed: [] };
          setLibrary(initialLib);
          localStorage.setItem(libKey, JSON.stringify(initialLib));
        }
      } else {
        setActiveUserId(null);
        setLibrary({ favorites: [], likes: [], recentlyPlayed: [] });
      }
    };

    handleUserChange();
    
    // Add event listener to listen to storage changes (or manual triggers)
    window.addEventListener('storage', handleUserChange);
    const interval = setInterval(handleUserChange, 1000); // Polling backup for quick reactive updates

    return () => {
      window.removeEventListener('storage', handleUserChange);
      clearInterval(interval);
    };
  }, []);

  // Save games helper
  const saveGames = (newGames: Game[]) => {
    setGames(newGames);
    localStorage.setItem('vibeplay_games', JSON.stringify(newGames));
  };

  // Save comments helper
  const saveComments = (newComments: Comment[]) => {
    setComments(newComments);
    localStorage.setItem('vibeplay_comments', JSON.stringify(newComments));
  };

  // Save reports helper
  const saveReports = (newReports: Report[]) => {
    setReports(newReports);
    localStorage.setItem('vibeplay_reports', JSON.stringify(newReports));
  };

  // Save logs helper
  const saveLogs = (newLogs: ActivityLog[]) => {
    setActivityLogs(newLogs);
    localStorage.setItem('vibeplay_activity_logs', JSON.stringify(newLogs));
  };

  // Save library helper
  const saveLibrary = (newLib: LibraryState) => {
    setLibrary(newLib);
    if (activeUserId) {
      localStorage.setItem(`vibeplay_lib_${activeUserId}`, JSON.stringify(newLib));
    }
  };

  // ---------------- PLAYER ACTIONS ----------------

  const toggleLikeGame = (gameId: string, userId: string) => {
    if (!userId) return;
    const hasLiked = library.likes.includes(gameId);
    let newLikes = [...library.likes];

    if (hasLiked) {
      newLikes = newLikes.filter(id => id !== gameId);
    } else {
      newLikes.push(gameId);
    }

    // Update library
    saveLibrary({ ...library, likes: newLikes });

    // Update game like counter
    const updatedGames = games.map(g => {
      if (g.id === gameId) {
        return {
          ...g,
          likes: g.likes + (hasLiked ? -1 : 1)
        };
      }
      return g;
    });
    saveGames(updatedGames);
  };

  const toggleFavoriteGame = (gameId: string, userId: string) => {
    if (!userId) return;
    const hasFavorited = library.favorites.includes(gameId);
    let newFavs = [...library.favorites];

    if (hasFavorited) {
      newFavs = newFavs.filter(id => id !== gameId);
    } else {
      newFavs.push(gameId);
    }

    saveLibrary({ ...library, favorites: newFavs });
  };

  const addRecentlyPlayed = (gameId: string, userId: string) => {
    if (!userId) return;
    
    // Increment plays count in games
    const updatedGames = games.map(g => {
      if (g.id === gameId) {
        return { ...g, plays: g.plays + 1 };
      }
      return g;
    });
    saveGames(updatedGames);

    // Update player library
    const filteredRecently = library.recentlyPlayed.filter(item => item.id !== gameId);
    const newRecently = [
      { id: gameId, timestamp: new Date().toISOString() },
      ...filteredRecently
    ].slice(0, 8); // Keep last 8

    saveLibrary({ ...library, recentlyPlayed: newRecently });
  };

  const addComment = (gameId: string, userId: string, username: string, avatar: string, content: string) => {
    const newComment: Comment = {
      id: `comment_${Date.now()}`,
      gameId,
      userId,
      username,
      userAvatar: avatar,
      content,
      likes: 0,
      userLiked: false,
      timestamp: new Date().toISOString()
    };
    saveComments([newComment, ...comments]);
  };

  const likeComment = (commentId: string, _userId: string) => {
    const updated = comments.map(c => {
      if (c.id === commentId) {
        const alreadyLiked = c.userLiked;
        return {
          ...c,
          likes: c.likes + (alreadyLiked ? -1 : 1),
          userLiked: !alreadyLiked
        };
      }
      return c;
    });
    saveComments(updated);
  };

  const deleteComment = (commentId: string) => {
    saveComments(comments.filter(c => c.id !== commentId));
  };

  const submitReport = (reporterId: string, reporterName: string, targetType: 'game' | 'comment' | 'user', targetId: string, targetName: string, reason: string) => {
    const newReport: Report = {
      id: `report_${Date.now()}`,
      reporterId,
      reporterName,
      targetType,
      targetId,
      targetName,
      reason,
      status: 'open',
      timestamp: new Date().toISOString()
    };
    saveReports([newReport, ...reports]);
  };

  // ---------------- CREATOR ACTIONS ----------------

  const createGame = (
    gameData: Omit<Game, 'id' | 'slug' | 'plays' | 'likes' | 'dislikes' | 'status' | 'updatedAt' | 'creatorId' | 'creatorName' | 'creatorAvatar'>, 
    creatorId: string, 
    creatorName: string, 
    creatorAvatar: string
  ): Game => {
    const newGame: Game = {
      ...gameData,
      id: `game_${Date.now()}`,
      slug: gameData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      creatorId,
      creatorName,
      creatorAvatar,
      plays: 0,
      likes: 0,
      dislikes: 0,
      status: 'draft', // Initially created as a draft
      updatedAt: new Date().toISOString().split('T')[0]
    };
    
    saveGames([...games, newGame]);
    return newGame;
  };

  const updateGame = (gameId: string, updatedFields: Partial<Game>) => {
    const updated = games.map(g => {
      if (g.id === gameId) {
        return {
          ...g,
          ...updatedFields,
          slug: updatedFields.title 
            ? updatedFields.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') 
            : g.slug,
          updatedAt: new Date().toISOString().split('T')[0]
        };
      }
      return g;
    });
    saveGames(updated);
  };

  const deleteGame = (gameId: string) => {
    saveGames(games.filter(g => g.id !== gameId));
  };

  const submitForReview = (gameId: string) => {
    const updated = games.map(g => {
      if (g.id === gameId) {
        return { ...g, status: 'pending' as GameStatus };
      }
      return g;
    });
    saveGames(updated);
  };

  const hideGame = (gameId: string) => {
    const updated = games.map(g => {
      if (g.id === gameId) {
        return { ...g, status: 'hidden' as GameStatus };
      }
      return g;
    });
    saveGames(updated);
  };

  const publishGameDraft = (gameId: string) => {
    const updated = games.map(g => {
      if (g.id === gameId) {
        return { ...g, status: 'published' as GameStatus };
      }
      return g;
    });
    saveGames(updated);
  };

  // ---------------- ADMIN ACTIONS ----------------

  const approveGame = (gameId: string, adminId: string, adminName: string) => {
    let approvedGameTitle = '';
    const updated = games.map(g => {
      if (g.id === gameId) {
        approvedGameTitle = g.title;
        return { ...g, status: 'published' as GameStatus, rejectReason: undefined };
      }
      return g;
    });
    saveGames(updated);

    // Add log
    const newLog: ActivityLog = {
      id: `log_${Date.now()}`,
      adminId,
      adminName,
      action: 'Approve Game',
      targetType: 'game',
      targetId: gameId,
      targetName: approvedGameTitle,
      timestamp: new Date().toISOString(),
      details: 'Static analysis and structural scan passed.'
    };
    saveLogs([newLog, ...activityLogs]);

    // Send notifications to game creator
    const targetGame = games.find(g => g.id === gameId);
    if (targetGame) {
      const newNotif = {
        id: `notif_${Date.now()}`,
        userId: targetGame.creatorId,
        type: 'game_approved' as const,
        title: 'Game Approved!',
        message: `Your game "${targetGame.title}" has been approved by admins and is now live!`,
        isRead: false,
        timestamp: new Date().toISOString(),
        relatedSlug: targetGame.slug
      };
      const storedNotifs = localStorage.getItem('vibeplay_notifications');
      const parsedNotifs = storedNotifs ? JSON.parse(storedNotifs) : [];
      localStorage.setItem('vibeplay_notifications', JSON.stringify([newNotif, ...parsedNotifs]));
    }
  };

  const rejectGame = (gameId: string, reason: string, adminId: string, adminName: string) => {
    let rejectedGameTitle = '';
    const updated = games.map(g => {
      if (g.id === gameId) {
        rejectedGameTitle = g.title;
        return { ...g, status: 'rejected' as GameStatus, rejectReason: reason };
      }
      return g;
    });
    saveGames(updated);

    const newLog: ActivityLog = {
      id: `log_${Date.now()}`,
      adminId,
      adminName,
      action: 'Reject Game',
      targetType: 'game',
      targetId: gameId,
      targetName: rejectedGameTitle,
      timestamp: new Date().toISOString(),
      details: `Reason: ${reason}`
    };
    saveLogs([newLog, ...activityLogs]);

    const targetGame = games.find(g => g.id === gameId);
    if (targetGame) {
      const newNotif = {
        id: `notif_${Date.now()}`,
        userId: targetGame.creatorId,
        type: 'game_rejected' as const,
        title: 'Game Submission Rejected',
        message: `Your game "${targetGame.title}" was not approved. Reason: ${reason}`,
        isRead: false,
        timestamp: new Date().toISOString(),
        relatedSlug: targetGame.slug
      };
      const storedNotifs = localStorage.getItem('vibeplay_notifications');
      const parsedNotifs = storedNotifs ? JSON.parse(storedNotifs) : [];
      localStorage.setItem('vibeplay_notifications', JSON.stringify([newNotif, ...parsedNotifs]));
    }
  };

  const toggleFeaturedGame = (gameId: string, category: 'hero' | 'trending' | 'editors_choice' | null, adminId: string, adminName: string) => {
    let gameTitle = '';
    const updated = games.map(g => {
      if (g.id === gameId) {
        gameTitle = g.title;
        return {
          ...g,
          isFeatured: category !== null,
          featuredCategory: category || undefined
        };
      }
      // If setting a new hero game, clear the previous hero game
      if (category === 'hero' && g.featuredCategory === 'hero') {
        return { ...g, isFeatured: false, featuredCategory: undefined };
      }
      return g;
    });
    saveGames(updated);

    const newLog: ActivityLog = {
      id: `log_${Date.now()}`,
      adminId,
      adminName,
      action: category ? 'Feature Game' : 'Remove Feature',
      targetType: 'game',
      targetId: gameId,
      targetName: gameTitle,
      timestamp: new Date().toISOString(),
      details: category ? `Set feature category to "${category}"` : 'Removed from featured lists.'
    };
    saveLogs([newLog, ...activityLogs]);
  };

  const resolveReport = (reportId: string) => {
    saveReports(reports.map(r => r.id === reportId ? { ...r, status: 'resolved' as const } : r));
  };

  const dismissReport = (reportId: string) => {
    saveReports(reports.map(r => r.id === reportId ? { ...r, status: 'dismissed' as const } : r));
  };

  const suspendUserGames = (creatorId: string) => {
    const updated = games.map(g => {
      if (g.creatorId === creatorId) {
        return { ...g, status: 'hidden' as GameStatus };
      }
      return g;
    });
    saveGames(updated);
  };

  return (
    <GamesContext.Provider value={{
      games, comments, reports, activityLogs, library,
      toggleLikeGame, toggleFavoriteGame, addRecentlyPlayed, addComment, likeComment, deleteComment, submitReport,
      createGame, updateGame, deleteGame, submitForReview, hideGame, publishGameDraft,
      approveGame, rejectGame, toggleFeaturedGame, resolveReport, dismissReport, suspendUserGames
    }}>
      {children}
    </GamesContext.Provider>
  );
};

export const useGames = () => {
  const context = useContext(GamesContext);
  if (!context) throw new Error('useGames must be used within GamesProvider');
  return context;
};
