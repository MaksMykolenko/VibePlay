import type { User } from '../types';

export const mockUsers: User[] = [
  {
    id: 'user_player',
    username: 'player_demo',
    displayName: 'Demo Player',
    email: 'player@vibeplay.demo',
    role: 'player',
    bio: 'Just a casual gamer who loves high-performance web games. Indie developer supporter.',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
    joinDate: '2026-01-15',
    followersCount: 12
  },
  {
    id: 'user_creator',
    username: 'creator_demo',
    displayName: 'Demo Creator',
    email: 'creator@vibeplay.demo',
    role: 'creator',
    bio: 'Building three.js and react-three-fiber physics engines. Let us push the boundaries of browser games!',
    avatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150',
    joinDate: '2026-02-10',
    followersCount: 142
  },
  {
    id: 'user_admin',
    username: 'admin_demo',
    displayName: 'VibePlay Admin',
    email: 'admin@vibeplay.demo',
    role: 'admin',
    bio: 'Platform administrator. Keeping VibePlay safe, clean, and optimized.',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150',
    joinDate: '2025-11-01',
    followersCount: 502
  },
  {
    id: 'user_neon_ninja',
    username: 'neon_ninja',
    displayName: 'Neon Ninja Games',
    email: 'ninja@neon.dev',
    role: 'creator',
    bio: 'Arcade and simulator games developer. Mostly using Phaser and Vanilla JS.',
    avatar: 'https://images.unsplash.com/photo-1628157582853-a796fa650a6a?w=150',
    joinDate: '2026-03-01',
    followersCount: 89
  },
  {
    id: 'user_pixel_craft',
    username: 'pixel_craft',
    displayName: 'PixelCraft Labs',
    email: 'pixel@craft.io',
    role: 'creator',
    bio: 'Retro styles, voxel structures, and CSS tricks. 8-bit aesthetic enthusiast.',
    avatar: 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=150',
    joinDate: '2026-02-28',
    followersCount: 231
  },
  {
    id: 'user_retro_gamer',
    username: 'retro_gamer',
    displayName: 'Retro Gamer 99',
    email: 'retro@gamer.com',
    role: 'player',
    bio: 'Looking for the best HTML5 and canvas pixel games. Speedrun enjoyer.',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
    joinDate: '2026-04-12',
    followersCount: 4
  }
];

export const DEMO_PASSWORD = 'demo123';
