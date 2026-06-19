import { randomBytes } from 'node:crypto';
import { GAME_COVER_CONTENT_TYPES, storageKeys, type GameCoverContentType } from '@vibeplay/shared';

export function newGameCoverObjectKey(gameId: string, contentType: GameCoverContentType): string {
  const extension = GAME_COVER_CONTENT_TYPES[contentType];
  const fileName = `${Date.now()}-${randomBytes(8).toString('hex')}.${extension}`;
  return storageKeys.gameCoverObject(gameId, fileName);
}

export function isGameCoverKey(gameId: string, key: string): boolean {
  const prefix = storageKeys.gameCoverPrefix(gameId);
  if (!key.startsWith(prefix)) return false;
  const rest = key.slice(prefix.length);
  if (rest.includes('..') || rest.includes('/')) return false;
  return /^[A-Za-z0-9._-]+\.(png|jpg|jpeg|webp)$/.test(rest);
}

export function gameCoverContentTypeForKey(key: string): GameCoverContentType {
  const extension = key.split('.').pop()?.toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return 'image/jpeg';
}
