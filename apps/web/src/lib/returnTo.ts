/**
 * Safe handling of the post-login `returnTo` target.
 *
 * The CTA sends players to /login or /register and we want to bring them back to
 * the exact play page afterward. To avoid an open-redirect, only app-internal
 * absolute paths are honored — anything pointing off-site collapses to "/".
 */
export function sanitizeReturnTo(value: string | null | undefined): string {
  if (!value) return '/';
  // Must be an internal absolute path beginning with a single "/".
  if (!value.startsWith('/')) return '/';
  // Reject protocol-relative ("//evil.com") and backslash tricks ("/\evil").
  if (value.startsWith('//') || value.startsWith('/\\')) return '/';
  // Reject anything that smuggles a scheme.
  if (value.includes('://')) return '/';
  return value.slice(0, 512);
}

/** Append a sanitized `returnTo` to an internal path (omitted when it's just "/"). */
export function withReturnTo(path: string, returnTo: string | null | undefined): string {
  const rt = sanitizeReturnTo(returnTo);
  if (rt === '/') return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}returnTo=${encodeURIComponent(rt)}`;
}
