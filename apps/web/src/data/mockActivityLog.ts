import type { ActivityLog } from '../types';

export const mockActivityLogs: ActivityLog[] = [
  {
    id: 'log_1',
    adminId: 'user_admin',
    adminName: 'VibePlay Admin',
    action: 'Approve Game',
    targetType: 'game',
    targetId: 'game_neon_drift',
    targetName: 'Neon Drift',
    timestamp: '2026-06-11T12:00:00Z',
    details: 'Static analysis sandbox passed: 0 vulnerabilities. Script injection checks verified.',
  },
  {
    id: 'log_2',
    adminId: 'user_admin',
    adminName: 'VibePlay Admin',
    action: 'Feature Game',
    targetType: 'game',
    targetId: 'game_backrooms_shift',
    targetName: 'Backrooms Shift',
    timestamp: '2026-06-11T14:30:00Z',
    details: "Added game to Editor's Choice list.",
  },
  {
    id: 'log_3',
    adminId: 'user_admin',
    adminName: 'VibePlay Admin',
    action: 'Dismiss Report',
    targetType: 'report',
    targetId: 'report_2',
    targetName: 'Neon Drift',
    timestamp: '2026-06-11T16:00:00Z',
    details: 'Closed compatibility report: User device does not support WebGL 2.0.',
  },
];
