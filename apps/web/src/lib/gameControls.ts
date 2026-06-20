import type { GameControlDto } from '@vibeplay/shared';

export const COMMON_BROWSER_GAME_CONTROLS: GameControlDto[] = [
  { action: 'Move', keys: 'WASD / Arrow keys' },
  { action: 'Camera', keys: 'Mouse / touch drag' },
  { action: 'Jump', keys: 'Space' },
  { action: 'Interact', keys: 'E' },
  { action: 'Pause / Back', keys: 'Esc' },
];

export const FAT_DIMA_SIMULATOR_CONTROLS: GameControlDto[] = [
  { action: 'Move', keys: 'WASD / Arrow keys' },
  { action: 'Camera', keys: 'Mouse / touch drag' },
  { action: 'Sprint', keys: 'Shift' },
  { action: 'Jump', keys: 'Space' },
  { action: 'Interact', keys: 'E' },
  { action: 'Eat', keys: 'F' },
  { action: 'Belly attack', keys: 'Q' },
  { action: 'Inventory', keys: 'I' },
  { action: 'Skills', keys: 'K' },
  { action: 'Quests', keys: 'J' },
  { action: 'Achievements', keys: 'H' },
  { action: 'Settings', keys: 'O' },
  { action: 'Pause / Back', keys: 'Esc' },
];
