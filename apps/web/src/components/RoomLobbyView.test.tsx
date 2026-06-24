import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { RoomDto, RoomPlayerDto } from '@vibeplay/shared';
import { RoomLobbyView } from './RoomLobbyView';
import { deriveLobbyView } from '../lib/rooms';

const t = (key: string) => key;
const noop = () => undefined;

function player(over: Partial<RoomPlayerDto> = {}): RoomPlayerDto {
  return {
    playerId: 'p1',
    displayName: 'Maks',
    avatarUrl: null,
    isHost: false,
    isYou: false,
    kind: 'guest',
    ...over,
  };
}

function room(over: Partial<RoomDto> = {}): RoomDto {
  return {
    roomId: 'r1',
    roomCode: 'ABC123',
    status: 'WAITING',
    visibility: 'PRIVATE',
    mode: 'free_for_all',
    maxPlayers: 8,
    playerCount: 2,
    game: { id: 'g1', slug: 'boxy', title: 'Boxy Tanks', coverUrl: null },
    host: null,
    players: [
      player({ playerId: 'h', displayName: 'Hostess', isHost: true, isYou: true }),
      player({ playerId: 'p2', displayName: 'Buddy' }),
    ],
    canJoin: true,
    expiresAt: '2030-01-01T00:00:00.000Z',
    createdAt: '2030-01-01T00:00:00.000Z',
    ...over,
  };
}

function render(r: RoomDto): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <RoomLobbyView
        room={r}
        view={deriveLobbyView(r)}
        starting={false}
        leaving={false}
        onCopyInvite={noop}
        onLeave={noop}
        onStart={noop}
        onJoinMatch={noop}
        t={t}
      />
    </MemoryRouter>,
  );
}

describe('RoomLobbyView', () => {
  it('shows the room code, the game title, the player list, and the host badge', () => {
    const html = render(room());
    expect(html).toContain('ABC123');
    expect(html).toContain('Boxy Tanks');
    expect(html).toContain('Hostess');
    expect(html).toContain('Buddy');
    expect(html).toContain('host-badge');
  });

  it('shows the Start button to the host while WAITING', () => {
    const html = render(room()); // the host (isYou) is also the host
    expect(html).toContain('start-game');
    expect(html).not.toContain('waiting-for-host');
  });

  it('shows "waiting for host" to a non-host member (no Start button)', () => {
    const html = render(
      room({
        players: [
          player({ playerId: 'h', displayName: 'Hostess', isHost: true, isYou: false }),
          player({ playerId: 'me', displayName: 'Me', isYou: true }),
        ],
      }),
    );
    expect(html).toContain('waiting-for-host');
    expect(html).not.toContain('start-game');
  });

  it('shows Join Match once the room is ACTIVE', () => {
    const html = render(room({ status: 'ACTIVE' }));
    expect(html).toContain('join-match');
    expect(html).not.toContain('start-game');
  });
});
