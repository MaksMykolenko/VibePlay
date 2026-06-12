import { describe, expect, it } from 'vitest';
import {
  isAllowedGameLaunchUrl,
  parseGameHostBase,
  parseGameHostName,
  previewGameOrigin,
  publishedGameOrigin,
} from './gameOrigin';

const base = parseGameHostBase('http://games.localhost:8080');
const prodBase = parseGameHostBase('https://games-beta.vibeplayusercontent.example');

describe('publishedGameOrigin / previewGameOrigin', () => {
  it('mints one origin per published version', () => {
    expect(publishedGameOrigin(base, 'g1abc', 'v1def')).toBe(
      'http://v1def.g1abc.games.localhost:8080',
    );
    expect(publishedGameOrigin(prodBase, 'g1abc', 'v2xyz')).toBe(
      'https://v2xyz.g1abc.games-beta.vibeplayusercontent.example',
    );
  });

  it('two versions of the same game get different origins', () => {
    expect(publishedGameOrigin(base, 'gameaa', 'versionaa')).not.toBe(
      publishedGameOrigin(base, 'gameaa', 'versionbb'),
    );
  });

  it('mints a dedicated preview origin', () => {
    expect(previewGameOrigin(base, 'v9rev')).toBe('http://v9rev.preview.games.localhost:8080');
  });

  it('rejects ids that are not safe DNS labels', () => {
    expect(() => publishedGameOrigin(base, 'evil.com', 'v1')).toThrow();
    expect(() => publishedGameOrigin(base, 'g1', 'UPPER')).toThrow();
    expect(() => publishedGameOrigin(base, 'g1', 'a'.repeat(64))).toThrow();
    expect(() => previewGameOrigin(base, 'bad!label')).toThrow();
    // "preview" is reserved for the preview host pattern.
    expect(() => publishedGameOrigin(base, 'preview', 'v1')).toThrow();
  });
});

describe('parseGameHostName', () => {
  it('parses published hosts', () => {
    expect(parseGameHostName('v1def.g1abc.games.localhost:8080', 'games.localhost')).toEqual({
      kind: 'published',
      gameId: 'g1abc',
      versionId: 'v1def',
    });
  });

  it('parses preview hosts', () => {
    expect(parseGameHostName('v1def.preview.games.localhost', 'games.localhost')).toEqual({
      kind: 'preview',
      versionId: 'v1def',
    });
  });

  it('identifies the bare base host', () => {
    expect(parseGameHostName('games.localhost:8080', 'games.localhost')).toEqual({ kind: 'base' });
  });

  it('refuses foreign and malformed hosts', () => {
    expect(parseGameHostName('evil.example', 'games.localhost')).toBeNull();
    expect(parseGameHostName('games.localhost.evil.example', 'games.localhost')).toBeNull();
    expect(parseGameHostName('a.b.c.games.localhost', 'games.localhost')).toBeNull();
    expect(parseGameHostName('onlyone.games.localhost', 'games.localhost')).toBeNull();
    expect(parseGameHostName('v1.bad_label.games.localhost', 'games.localhost')).toBeNull();
  });

  it('treats DNS names case-insensitively (Host headers may differ in case)', () => {
    expect(parseGameHostName('V1.G1.Games.LOCALHOST', 'games.localhost')).toEqual({
      kind: 'published',
      gameId: 'g1',
      versionId: 'v1',
    });
  });
});

describe('isAllowedGameLaunchUrl', () => {
  it('accepts per-version subdomain launch URLs', () => {
    expect(
      isAllowedGameLaunchUrl(
        'http://v1def.g1abc.games.localhost:8080/index.html',
        'http://games.localhost:8080',
      ),
    ).toBe(true);
  });

  it('rejects the shared base origin, foreign origins and scheme/port drift', () => {
    expect(
      isAllowedGameLaunchUrl(
        'http://games.localhost:8080/g/x/y/index.html',
        'http://games.localhost:8080',
      ),
    ).toBe(false);
    expect(
      isAllowedGameLaunchUrl('http://evil.example/index.html', 'http://games.localhost:8080'),
    ).toBe(false);
    expect(
      isAllowedGameLaunchUrl(
        'https://v1.g1.games.localhost:8080/index.html',
        'http://games.localhost:8080',
      ),
    ).toBe(false);
    expect(
      isAllowedGameLaunchUrl(
        'http://v1.g1.games.localhost:9999/index.html',
        'http://games.localhost:8080',
      ),
    ).toBe(false);
    expect(isAllowedGameLaunchUrl('not a url', 'http://games.localhost:8080')).toBe(false);
  });
});
