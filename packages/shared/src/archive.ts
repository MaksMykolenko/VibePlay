import { ALLOWED_EXTENSIONS, FORBIDDEN_EXTENSIONS } from './constants.js';

/**
 * Pure archive-entry validation helpers (spec §21).
 * Used by the worker pipeline and unit-tested without any I/O.
 */

export interface PathCheckResult {
  ok: boolean;
  reason?: string;
  /** NFC-normalized, forward-slash relative path (defined when ok). */
  normalized?: string;
}

const WINDOWS_DRIVE = /^[a-zA-Z]:[\\/]/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** Validate a single archive entry path. Directories should end with '/'. */
export function checkArchivePath(rawPath: string): PathCheckResult {
  if (rawPath.length === 0) return { ok: false, reason: 'empty path' };
  if (rawPath.length > 1024) return { ok: false, reason: 'path too long' };
  if (CONTROL_CHARS.test(rawPath)) return { ok: false, reason: 'control characters in path' };

  // Normalize unicode early so traversal checks see the same string we store.
  const nfc = rawPath.normalize('NFC');

  if (nfc.includes('\\')) return { ok: false, reason: 'backslash in path' };
  if (nfc.startsWith('/')) return { ok: false, reason: 'absolute path' };
  if (WINDOWS_DRIVE.test(nfc)) return { ok: false, reason: 'windows drive path' };

  const segments = nfc.split('/');
  for (const seg of segments) {
    if (seg === '..') return { ok: false, reason: 'path traversal (..)' };
    if (seg === '' && segments.indexOf(seg) !== segments.length - 1) {
      // empty segment in the middle => '//'
      return { ok: false, reason: 'empty path segment' };
    }
  }
  return { ok: true, normalized: nfc };
}

export function fileExtension(p: string): string {
  const base = p.split('/').pop() ?? '';
  const idx = base.lastIndexOf('.');
  if (idx <= 0) return '';
  return base.slice(idx).toLowerCase();
}

export type ExtensionVerdict = 'allowed' | 'forbidden' | 'unknown';

export function checkExtension(p: string): ExtensionVerdict {
  const ext = fileExtension(p);
  if (ext === '') return 'unknown';
  if (FORBIDDEN_EXTENSIONS.has(ext)) return 'forbidden';
  if (ALLOWED_EXTENSIONS.has(ext)) return 'allowed';
  return 'unknown';
}

/**
 * Detect collisions after normalization: case-insensitive + NFC, so
 * "Sprite.PNG" and "sprite.png" (or NFD variants) collide.
 */
export function findCollision(paths: string[]): string | null {
  const seen = new Set<string>();
  for (const p of paths) {
    const key = p.normalize('NFC').toLowerCase();
    if (seen.has(key)) return p;
    seen.add(key);
  }
  return null;
}

/** Unix mode → is symlink (zip external attributes high 16 bits). */
export function isSymlinkMode(externalFileAttributes: number): boolean {
  const unixMode = (externalFileAttributes >>> 16) & 0xffff;
  return (unixMode & 0xf000) === 0xa000;
}

export function isDirectoryEntry(path: string): boolean {
  return path.endsWith('/');
}

/** The build must contain index.html at the archive root. */
export function hasRootIndexHtml(paths: string[]): boolean {
  return paths.some((p) => p.normalize('NFC') === 'index.html');
}
