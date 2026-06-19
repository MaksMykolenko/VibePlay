/** Upload & archive validation constants. Limits are defaults; env can override. */

export const DEFAULT_UPLOAD_LIMITS = {
  maxCompressedBytes: 50 * 1024 * 1024,
  maxUncompressedBytes: 250 * 1024 * 1024,
  maxFiles: 5000,
  maxSingleFileBytes: 50 * 1024 * 1024,
} as const;

export interface UploadLimits {
  maxCompressedBytes: number;
  maxUncompressedBytes: number;
  maxFiles: number;
  maxSingleFileBytes: number;
}

/** Only static browser content is allowed in game builds. */
export const ALLOWED_EXTENSIONS = new Set([
  // markup / code
  '.html',
  '.htm',
  '.css',
  '.js',
  '.mjs',
  '.map',
  // wasm
  '.wasm',
  // data
  '.json',
  '.txt',
  '.md',
  '.xml',
  '.csv',
  '.atlas',
  '.fnt',
  '.tmx',
  '.tsx_map',
  // images
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  '.svg',
  '.ico',
  '.bmp',
  '.ktx2',
  '.basis',
  '.dds',
  '.hdr',
  '.exr',
  // audio
  '.mp3',
  '.ogg',
  '.wav',
  '.m4a',
  '.flac',
  '.opus',
  // video
  '.mp4',
  '.webm',
  // fonts
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  // 3d
  '.glb',
  '.gltf',
  '.bin',
  '.obj',
  '.mtl',
  '.fbx',
  '.drc',
]);

/** Server-side / executable content is forbidden regardless of anything else. */
export const FORBIDDEN_EXTENSIONS = new Set([
  '.php',
  '.phar',
  '.py',
  '.pyc',
  '.rb',
  '.pl',
  '.sh',
  '.bash',
  '.zsh',
  '.exe',
  '.dll',
  '.dylib',
  '.so',
  '.jar',
  '.war',
  '.ps1',
  '.bat',
  '.cmd',
  '.msi',
  '.com',
  '.scr',
  '.apk',
  '.app',
  '.deb',
  '.rpm',
  '.asp',
  '.aspx',
  '.jsp',
  '.cgi',
]);

/** MIME types used by the game host when serving extracted files. */
export const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.map': 'application/json',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.csv': 'text/csv',
  '.atlas': 'text/plain; charset=utf-8',
  '.fnt': 'text/plain; charset=utf-8',
  '.tmx': 'application/xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.ktx2': 'image/ktx2',
  '.basis': 'application/octet-stream',
  '.dds': 'image/vnd-ms.dds',
  '.hdr': 'application/octet-stream',
  '.exr': 'application/octet-stream',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.opus': 'audio/opus',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.obj': 'text/plain; charset=utf-8',
  '.mtl': 'text/plain; charset=utf-8',
  '.fbx': 'application/octet-stream',
  '.drc': 'application/octet-stream',
};

export const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
export const COMMENT_MAX_LENGTH = 2000;
export const BIO_MAX_LENGTH = 500;
export const DISPLAY_NAME_MAX_LENGTH = 50;
export const GAME_TITLE_MAX_LENGTH = 80;
export const GAME_SHORT_DESC_MAX_LENGTH = 200;
export const GAME_DESC_MAX_LENGTH = 5000;
export const REPORT_DETAILS_MAX_LENGTH = 2000;
export const MAX_SCREENSHOTS = 6;

/** Storage object key layout (immutable once published). */
export const storageKeys = {
  quarantineZip: (uploadId: string) => `quarantine/${uploadId}.zip`,
  publishedPrefix: (gameId: string, versionId: string) => `games/${gameId}/${versionId}/`,
  /** Prefix for a user's avatar objects in the private avatars bucket. */
  avatarPrefix: (userId: string) => `users/${userId}/avatar/`,
  /** Full key for one avatar object. `fileName` must already be sanitized. */
  avatarObject: (userId: string, fileName: string) => `users/${userId}/avatar/${fileName}`,
};

/**
 * Avatar uploads: allowed image content types → canonical file extension.
 * SVG is intentionally excluded — it is an XML document that can carry scripts,
 * so it must never be accepted as an avatar (spec: no SVG/scripts).
 */
export const AVATAR_CONTENT_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
} as const;

export type AvatarContentType = keyof typeof AVATAR_CONTENT_TYPES;

/** Accepted avatar file extensions (lowercase, no dot). */
export const AVATAR_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'] as const;
