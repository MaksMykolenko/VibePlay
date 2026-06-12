import type { Report } from '../types';

export const mockReports: Report[] = [
  {
    id: 'report_1',
    reporterId: 'user_retro_gamer',
    reporterName: 'retro_gamer',
    targetType: 'comment',
    targetId: 'comment_cyber_spam',
    targetName: 'HACK SITE http://spam-link-example.com TO GET FREE GEMS...',
    reason: 'Spam, advertisement links, and phishing content.',
    status: 'open',
    timestamp: '2026-06-11T23:10:00Z'
  },
  {
    id: 'report_2',
    reporterId: 'user_player',
    reporterName: 'player_demo',
    targetType: 'game',
    targetId: 'game_neon_drift',
    targetName: 'Neon Drift',
    reason: 'Game gets stuck on loading scene if graphics quality is set to ultra on low-end laptops.',
    status: 'reviewing',
    timestamp: '2026-06-10T11:40:00Z'
  },
  {
    id: 'report_3',
    reporterId: 'user_neon_ninja',
    reporterName: 'neon_ninja',
    targetType: 'user',
    targetId: 'user_hacker',
    targetName: 'cheater_boy',
    reason: 'This user is uploading duplicate Phaser scripts claiming them as original builds.',
    status: 'open',
    timestamp: '2026-06-11T02:15:00Z'
  }
];
