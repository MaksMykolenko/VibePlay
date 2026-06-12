import type { Comment } from '../types';

export const mockComments: Comment[] = [
  {
    id: 'comment_1',
    gameId: 'game_neon_drift',
    userId: 'user_player',
    username: 'player_demo',
    userAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
    content:
      'Man, the shaders on this web game are absolutely incredible! Runs at a smooth 60fps on my Macbook. Perfect retro vibe.',
    likes: 24,
    userLiked: true,
    timestamp: '2026-06-11T20:30:00Z',
  },
  {
    id: 'comment_2',
    gameId: 'game_neon_drift',
    userId: 'user_pixel_craft',
    username: 'pixel_craft',
    userAvatar: 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=150',
    content:
      'Very clean drift physics. Did you use custom friction formulas or build on standard ammunition physics?',
    likes: 15,
    userLiked: false,
    timestamp: '2026-06-10T14:22:00Z',
  },
  {
    id: 'comment_3',
    gameId: 'game_tiny_kingdom',
    userId: 'user_player',
    username: 'player_demo',
    userAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
    content:
      'Goblins attacked my gold mine on night 15 and wiped out my whole fort! 10/10 simulator, would get raided again.',
    likes: 42,
    userLiked: false,
    timestamp: '2026-06-09T18:45:00Z',
  },
  {
    id: 'comment_4',
    gameId: 'game_backrooms_shift',
    userId: 'user_retro_gamer',
    username: 'retro_gamer',
    userAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
    content:
      'Actually scary. The background buzzing sound really plays tricks on your ears. The creature model is pure nightmares.',
    likes: 31,
    userLiked: false,
    timestamp: '2026-06-11T09:12:00Z',
  },
  {
    id: 'comment_5',
    gameId: 'game_cyber_delivery',
    userId: 'user_player',
    username: 'player_demo',
    userAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
    content:
      'Extremely fast and responsive controls, although the hitbox on flying cabs is a bit large. Love it!',
    likes: 8,
    userLiked: false,
    timestamp: '2026-06-05T12:00:00Z',
  },
];
