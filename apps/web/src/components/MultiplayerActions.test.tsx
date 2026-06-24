import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MultiplayerActions } from './MultiplayerActions';
import { multiplayerUi } from '../lib/rooms';

const t = (key: string) => key;
const noop = () => undefined;

function render(opts: { multiplayer: boolean; isDemo?: boolean; creating?: boolean; modes?: string[] }): string {
  const ui = multiplayerUi({
    multiplayer: opts.multiplayer,
    isDemo: opts.isDemo ?? false,
    isOwnerOrAdmin: false,
    info: opts.modes
      ? { enabled: true, maxPlayers: 8, transport: 'EXTERNAL_WS', wsUrl: 'wss://x', modes: opts.modes }
      : undefined,
  });
  return renderToStaticMarkup(
    <MultiplayerActions
      ui={ui}
      creating={opts.creating ?? false}
      onPlayWithFriends={noop}
      onQuickPlay={noop}
      t={t}
    />,
  );
}

describe('MultiplayerActions', () => {
  it('renders "Play with Friends" when multiplayer is enabled', () => {
    const html = render({ multiplayer: true });
    expect(html).toContain('play-with-friends');
    expect(html).toContain('game.playWithFriends');
  });

  it('renders nothing when multiplayer is disabled', () => {
    expect(render({ multiplayer: false })).toBe('');
  });

  it('renders nothing in the demo build', () => {
    expect(render({ multiplayer: true, isDemo: true })).toBe('');
  });

  it('shows the creating label while a room is being created', () => {
    const html = render({ multiplayer: true, creating: true });
    expect(html).toContain('rooms.creating');
    expect(html).not.toContain('game.playWithFriends');
  });

  it('shows Quick Play only when a quick_play mode is declared', () => {
    expect(render({ multiplayer: true, modes: ['quick_play'] })).toContain('quick-play');
    expect(render({ multiplayer: true, modes: [] })).not.toContain('quick-play');
  });
});
