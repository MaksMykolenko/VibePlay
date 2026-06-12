/**
 * Per-version game origins (spec §24–27).
 *
 * Every PUBLISHED game version is served from its own origin:
 *
 *     {versionId}.{gameId}.{gameHostBase}        → published content
 *     {versionId}.preview.{gameHostBase}         → admin moderation preview
 *
 * where `gameHostBase` is the host[:port] of the GAME_ORIGIN env URL, e.g.
 * `games.localhost:8080` locally or `games-beta.vibeplayusercontent.example`
 * in staging/production.
 *
 * Why: with `allow-scripts allow-same-origin` in the player iframe, the only
 * way to stop game A from reading game B's localStorage / IndexedDB / Cache
 * Storage / Service Workers is to give every version a distinct origin.
 * The base domain must be a SEPARATE registrable domain from the main app so
 * cookies and site-scoped permissions never overlap with the platform itself.
 *
 * IDs are cuid/cuid2 (lowercase letters + digits) and therefore valid DNS
 * labels; we still validate to be explicit.
 */

/**
 * DNS label as used for game/version ids: lowercase alphanumeric with inner
 * dashes, ≤63 chars. Database ids are cuid (lowercase alphanumeric) and always
 * satisfy this. The literal label "preview" is reserved for preview hosts.
 */
const ID_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function isValidOriginLabel(value: string): boolean {
  return ID_LABEL_RE.test(value) && value !== 'preview';
}

export interface GameHostBase {
  /** "http:" | "https:" */
  protocol: string;
  /** hostname without port, e.g. "games.localhost" */
  hostname: string;
  /** ":8080" or "" when default port */
  portSuffix: string;
}

// Platform-neutral URL parsing (this package compiles without DOM/Node libs).
const HTTP_URL_RE = /^(https?:)\/\/([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::(\d{1,5}))?(\/[^\s]*)?$/i;

/** Parse the GAME_ORIGIN env URL into the pieces used to mint per-version hosts. */
export function parseGameHostBase(gameOriginUrl: string): GameHostBase {
  const m = HTTP_URL_RE.exec(gameOriginUrl.trim());
  if (!m) throw new Error('GAME_ORIGIN must be an http(s) origin URL');
  return {
    protocol: m[1]!.toLowerCase(),
    hostname: m[2]!.toLowerCase(),
    portSuffix: m[3] ? `:${m[3]}` : '',
  };
}

/** Origin (scheme://host[:port]) serving one published game version. */
export function publishedGameOrigin(base: GameHostBase, gameId: string, versionId: string): string {
  if (!isValidOriginLabel(gameId) || !isValidOriginLabel(versionId)) {
    throw new Error('gameId/versionId are not valid DNS labels');
  }
  return `${base.protocol}//${versionId}.${gameId}.${base.hostname}${base.portSuffix}`;
}

/** Origin serving the admin preview of one READY_FOR_REVIEW version. */
export function previewGameOrigin(base: GameHostBase, versionId: string): string {
  if (!isValidOriginLabel(versionId)) {
    throw new Error('versionId is not a valid DNS label');
  }
  return `${base.protocol}//${versionId}.preview.${base.hostname}${base.portSuffix}`;
}

export type ParsedGameHost =
  | { kind: 'published'; gameId: string; versionId: string }
  | { kind: 'preview'; versionId: string }
  | { kind: 'base' }
  | null;

/**
 * Classify an incoming Host header against the configured base hostname.
 * Returns null for hosts that do not belong to the game-host base domain or
 * do not match a known pattern (those requests must be refused).
 */
export function parseGameHostName(hostHeader: string, baseHostname: string): ParsedGameHost {
  const hostname = hostHeader.split(':')[0]!.toLowerCase();
  const base = baseHostname.toLowerCase();

  if (hostname === base) return { kind: 'base' };
  if (!hostname.endsWith(`.${base}`)) return null;

  const labels = hostname.slice(0, -(base.length + 1)).split('.');
  if (labels.length === 2 && labels[1] === 'preview' && isValidOriginLabel(labels[0]!)) {
    return { kind: 'preview', versionId: labels[0]! };
  }
  if (labels.length === 2 && isValidOriginLabel(labels[0]!) && isValidOriginLabel(labels[1]!)) {
    return { kind: 'published', gameId: labels[1]!, versionId: labels[0]! };
  }
  return null;
}

/**
 * Client-side check used by the web app before mounting the iframe: the
 * launch URL must be a subdomain origin of the configured game host base
 * (same scheme + port, host strictly UNDER the base, never the base itself
 * and never the main app origin).
 */
export function isAllowedGameLaunchUrl(gameUrl: string, gameOriginBaseUrl: string): boolean {
  try {
    const m = HTTP_URL_RE.exec(gameUrl.trim());
    if (!m) return false;
    const base = parseGameHostBase(gameOriginBaseUrl);
    if (m[1]!.toLowerCase() !== base.protocol) return false;
    if ((m[3] ? `:${m[3]}` : '') !== base.portSuffix) return false;
    const parsed = parseGameHostName(m[2]!, base.hostname);
    return parsed !== null && parsed.kind !== 'base';
  } catch {
    return false;
  }
}
