import { sanitizeReturnTo } from '@vibeplay/shared';

export { sanitizeReturnTo } from '@vibeplay/shared';

/** Append a sanitized `returnTo` to an internal path (omitted when it's just "/"). */
export function withReturnTo(path: string, returnTo: string | null | undefined): string {
  const rt = sanitizeReturnTo(returnTo);
  if (rt === '/') return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}returnTo=${encodeURIComponent(rt)}`;
}
