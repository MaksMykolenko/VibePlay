import { randomBytes } from 'node:crypto';
import { AVATAR_CONTENT_TYPES, type AvatarContentType, storageKeys } from '@vibeplay/shared';

/**
 * Avatar upload security helpers (spec: no SVG/scripts, no executable types,
 * size limit, object key cannot be user-controlled path traversal).
 */

/**
 * Verify the buffer's leading "magic bytes" match the declared image type.
 * Defends against content-type spoofing — e.g. an HTML/JS or SVG payload
 * mislabeled as image/png. Returns the real type, or null if it is not one of
 * the accepted raster image formats.
 */
export function sniffImageType(buf: Buffer): AvatarContentType | null {
  if (buf.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'image/png';
  }
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  // WEBP: "RIFF" .... "WEBP"
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

/**
 * Build a fresh, collision-resistant avatar object key under the user's own
 * prefix. The key is fully server-generated — the client never controls it.
 */
export function newAvatarObjectKey(userId: string, contentType: AvatarContentType): string {
  const ext = AVATAR_CONTENT_TYPES[contentType];
  const fileName = `${Date.now()}-${randomBytes(8).toString('hex')}.${ext}`;
  return storageKeys.avatarObject(userId, fileName);
}

/**
 * True iff `key` is exactly within this user's avatar prefix and is a single
 * safe filename with an allowed extension (no path separators, no traversal).
 * This is the IDOR/path-traversal gate for the avatar "complete" step.
 */
export function isOwnAvatarKey(userId: string, key: string): boolean {
  const prefix = storageKeys.avatarPrefix(userId);
  if (!key.startsWith(prefix)) return false;
  const rest = key.slice(prefix.length);
  if (rest.includes('..') || rest.includes('/')) return false;
  return /^[A-Za-z0-9._-]+\.(png|jpg|jpeg|webp)$/.test(rest);
}

/** Content type to serve a stored avatar object with, inferred from its key. */
export function avatarContentTypeForKey(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}
