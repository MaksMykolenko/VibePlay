import { describe, expect, it } from 'vitest';
import {
  checkArchivePath,
  checkExtension,
  findCollision,
  hasRootIndexHtml,
  isSymlinkMode,
} from './index.js';

describe('archive validation helpers', () => {
  it.each([
    ['/index.html', 'absolute path'],
    ['../index.html', 'path traversal'],
    ['assets\\game.js', 'backslash'],
    ['assets//game.js', 'empty path segment'],
    ['C:\\game\\index.html', 'backslash'],
    ['bad\u0000name.js', 'control characters'],
  ])('rejects unsafe path %s', (value, reason) => {
    expect(checkArchivePath(value)).toMatchObject({ ok: false });
    expect(checkArchivePath(value).reason).toContain(reason);
  });

  it('normalizes unicode and accepts safe relative paths', () => {
    expect(checkArchivePath('cafe\u0301/game.js')).toEqual({
      ok: true,
      normalized: 'café/game.js',
    });
  });

  it('applies the static asset allowlist and executable denylist', () => {
    expect(checkExtension('index.html')).toBe('allowed');
    expect(checkExtension('server.php')).toBe('forbidden');
    expect(checkExtension('secret.pem')).toBe('unknown');
  });

  it('detects case and unicode-normalized collisions', () => {
    expect(findCollision(['Sprite.PNG', 'sprite.png'])).toBe('sprite.png');
    expect(findCollision(['café.js', 'cafe\u0301.js'])).toBe('cafe\u0301.js');
  });

  it('detects symlink modes and requires a root index', () => {
    expect(isSymlinkMode(0xa1ff0000)).toBe(true);
    expect(isSymlinkMode(0x81a40000)).toBe(false);
    expect(hasRootIndexHtml(['assets/index.html'])).toBe(false);
    expect(hasRootIndexHtml(['index.html', 'assets/game.js'])).toBe(true);
  });
});
