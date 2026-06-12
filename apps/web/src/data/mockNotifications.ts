import type { Notification } from '../types';

export const mockNotifications: Notification[] = [
  {
    id: 'notif_1',
    userId: 'user_creator',
    type: 'game_approved',
    title: 'Game Approved',
    message: 'Your browser game "Neon Drift" successfully passed code scanning and moderation, and is now Published!',
    isRead: false,
    timestamp: '2026-06-11T12:00:00Z',
    relatedSlug: 'neon-drift'
  },
  {
    id: 'notif_2',
    userId: 'user_creator',
    type: 'game_featured',
    title: 'Featured Game!',
    message: 'Congratulations! "Backrooms Shift" was featured on the homepage in the Editor\'s Choice section.',
    isRead: false,
    timestamp: '2026-06-11T14:30:00Z',
    relatedSlug: 'backrooms-shift'
  },
  {
    id: 'notif_3',
    userId: 'user_creator',
    type: 'new_comment',
    title: 'New Comment',
    message: 'player_demo left a comment on your game "Neon Drift": "Man, the shaders on this web..."',
    isRead: true,
    timestamp: '2026-06-11T20:31:00Z',
    relatedSlug: 'neon-drift'
  },
  {
    id: 'notif_4',
    userId: 'user_player',
    type: 'platform_announcement',
    title: 'VibePlay Beta Update',
    message: 'Welcome to VibePlay! You can now publish games built with Cursor, Gemini, Claude, Phaser, Three.js, and more.',
    isRead: false,
    timestamp: '2026-06-10T08:00:00Z'
  },
  {
    id: 'notif_5',
    userId: 'user_player',
    type: 'new_comment',
    title: 'Reply Received',
    message: 'Creator pixel_craft liked your comment on "Tiny Kingdom".',
    isRead: true,
    timestamp: '2026-06-10T15:00:00Z',
    relatedSlug: 'tiny-kingdom'
  }
];
