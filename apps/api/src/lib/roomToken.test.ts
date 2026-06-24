import { describe, expect, it } from 'vitest';
import {
  ROOM_TOKEN_TTL_SECONDS,
  signRoomToken,
  verifyRoomToken,
  type RoomTokenInput,
} from './roomToken.js';

const SECRET = 'a'.repeat(48);

const baseClaims: RoomTokenInput = {
  roomId: 'room-1',
  roomCode: 'ABC123',
  gameId: 'game-1',
  versionId: 'ver-1',
  playerId: 'player-1',
  userId: 'user-1',
  guestId: null,
  displayName: 'Maks',
  isHost: true,
  transport: 'external_ws',
};

describe('roomToken', () => {
  it('signs and verifies a token, preserving claims', () => {
    const now = 1_700_000_000_000;
    const token = signRoomToken(baseClaims, SECRET, 120, now);
    const result = verifyRoomToken(token, SECRET, { nowMs: now });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.claims.roomId).toBe('room-1');
    expect(result.claims.roomCode).toBe('ABC123');
    expect(result.claims.gameId).toBe('game-1');
    expect(result.claims.playerId).toBe('player-1');
    expect(result.claims.userId).toBe('user-1');
    expect(result.claims.guestId).toBeNull();
    expect(result.claims.isHost).toBe(true);
    expect(result.claims.iat).toBe(Math.floor(now / 1000));
    expect(result.claims.exp).toBe(Math.floor(now / 1000) + 120);
  });

  it('rejects an expired token', () => {
    const issued = 1_700_000_000_000;
    const token = signRoomToken(baseClaims, SECRET, ROOM_TOKEN_TTL_SECONDS, issued);
    // Far enough in the future to clear ttl + skew.
    const later = issued + (ROOM_TOKEN_TTL_SECONDS + 60) * 1000;
    const result = verifyRoomToken(token, SECRET, { nowMs: later });
    expect(result).toEqual({ ok: false, reason: 'expired' });
  });

  it('rejects a token signed with a different secret', () => {
    const token = signRoomToken(baseClaims, SECRET, 120, 1_700_000_000_000);
    const result = verifyRoomToken(token, 'b'.repeat(48), { nowMs: 1_700_000_000_000 });
    expect(result).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects a tampered payload', () => {
    const now = 1_700_000_000_000;
    const token = signRoomToken(baseClaims, SECRET, 120, now);
    const [header, payload, sig] = token.split('.');
    // Flip a byte in the payload; signature no longer matches.
    const tampered = `${header}.${payload}x.${sig}`;
    const result = verifyRoomToken(tampered, SECRET, { nowMs: now });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(['bad_signature', 'malformed']).toContain(result.reason);
  });

  it('rejects a token minted for a different game when expectedGameId is set', () => {
    const now = 1_700_000_000_000;
    const token = signRoomToken(baseClaims, SECRET, 120, now);
    const result = verifyRoomToken(token, SECRET, { nowMs: now, expectedGameId: 'other-game' });
    expect(result).toEqual({ ok: false, reason: 'invalid_claims' });
    // ...but accepts the matching game id.
    const okResult = verifyRoomToken(token, SECRET, { nowMs: now, expectedGameId: 'game-1' });
    expect(okResult.ok).toBe(true);
  });

  it('rejects malformed tokens', () => {
    expect(verifyRoomToken('not-a-token', SECRET)).toEqual({ ok: false, reason: 'malformed' });
    expect(verifyRoomToken('a.b', SECRET)).toEqual({ ok: false, reason: 'malformed' });
  });

  it('honors guest identity (userId null, guestId set)', () => {
    const now = 1_700_000_000_000;
    const token = signRoomToken(
      { ...baseClaims, userId: null, guestId: 'guest-9', isHost: false },
      SECRET,
      120,
      now,
    );
    const result = verifyRoomToken(token, SECRET, { nowMs: now });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.claims.userId).toBeNull();
    expect(result.claims.guestId).toBe('guest-9');
    expect(result.claims.isHost).toBe(false);
  });
});
