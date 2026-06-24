import React from 'react';
import { Users, Zap } from 'lucide-react';
import type { MultiplayerUi } from '../lib/rooms';

/**
 * Presentational multiplayer buttons for the game page. Pure (no data fetching),
 * so it renders deterministically and is unit-testable with renderToStaticMarkup.
 * Visibility is decided by `multiplayerUi()` in lib/rooms.
 */
export interface MultiplayerActionsProps {
  ui: MultiplayerUi;
  creating: boolean;
  onPlayWithFriends: () => void;
  onQuickPlay: () => void;
  t: (key: string) => string;
}

export const MultiplayerActions: React.FC<MultiplayerActionsProps> = ({
  ui,
  creating,
  onPlayWithFriends,
  onQuickPlay,
  t,
}) => {
  if (!ui.showPlayWithFriends && !ui.showQuickPlay) return null;
  return (
    <>
      {ui.showPlayWithFriends && (
        <button
          onClick={onPlayWithFriends}
          disabled={creating}
          className="btn btn-secondary"
          style={{ flex: 2, gap: '8px', padding: '1rem' }}
          data-testid="play-with-friends"
        >
          <Users size={18} />
          <strong style={{ fontSize: '1rem' }}>
            {t(creating ? 'rooms.creating' : 'game.playWithFriends')}
          </strong>
        </button>
      )}
      {ui.showQuickPlay && (
        <button
          onClick={onQuickPlay}
          disabled={creating}
          className="btn btn-secondary"
          style={{ flex: 1, gap: '6px', padding: '1rem' }}
          data-testid="quick-play"
        >
          <Zap size={16} />
          <span>{t('game.quickPlay')}</span>
        </button>
      )}
    </>
  );
};
