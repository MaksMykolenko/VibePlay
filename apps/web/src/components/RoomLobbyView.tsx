import React from 'react';
import { Link } from 'react-router-dom';
import type { RoomDto } from '@vibeplay/shared';
import { Users, Crown, Copy, LogOut, Play, ArrowLeft } from 'lucide-react';
import type { LobbyView } from '../lib/rooms';

const STATUS_KEY: Record<RoomDto['status'], string> = {
  WAITING: 'rooms.statusWaiting',
  ACTIVE: 'rooms.statusActive',
  FINISHED: 'rooms.statusFinished',
  EXPIRED: 'rooms.statusExpired',
};

type Translate = (key: string, params?: Record<string, string | number>) => string;

/**
 * Presentational multiplayer lobby. Pure render from (room, view) + handlers, so
 * it's deterministic and unit-testable with renderToStaticMarkup. All data
 * fetching / polling / navigation lives in RoomLobbyPage (the container).
 */
export interface RoomLobbyViewProps {
  room: RoomDto;
  view: LobbyView;
  starting: boolean;
  leaving: boolean;
  onCopyInvite: () => void;
  onLeave: () => void;
  onStart: () => void;
  onJoinMatch: () => void;
  t: Translate;
}

export const RoomLobbyView: React.FC<RoomLobbyViewProps> = ({
  room,
  view,
  starting,
  leaving,
  onCopyInvite,
  onLeave,
  onStart,
  onJoinMatch,
  t,
}) => {
  return (
    <div className="container" style={pageStyle}>
      <div style={headerStyle}>
        {room.game.coverUrl && (
          <img src={room.game.coverUrl} alt={room.game.title} style={coverStyle} />
        )}
        <div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {t('rooms.lobbyTitle')}
          </div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 700 }}>{room.game.title}</h1>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {t('rooms.maxPlayers', { count: room.maxPlayers })} ·{' '}
            <span data-testid="room-status">{t(STATUS_KEY[room.status])}</span>
          </div>
        </div>
      </div>

      {/* Room code + invite */}
      <div className="bg-glass" style={codeCardStyle}>
        <div>
          <div style={labelStyle}>{t('rooms.roomCode')}</div>
          <div style={codeStyle} data-testid="room-code">
            {room.roomCode}
          </div>
        </div>
        <button onClick={onCopyInvite} className="btn btn-secondary" style={{ gap: '6px' }}>
          <Copy size={16} /> {t('rooms.copyInvite')}
        </button>
      </div>

      {/* Player list */}
      <div style={{ marginTop: '1.5rem' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem' }}>
          <Users size={18} /> {t('rooms.players')} ({room.playerCount}/{room.maxPlayers})
        </h3>
        <ul style={listStyle} data-testid="player-list">
          {room.players.map((p) => (
            <li key={p.playerId} style={playerRowStyle}>
              <span style={avatarStyle}>
                {p.avatarUrl ? (
                  <img
                    src={p.avatarUrl}
                    alt=""
                    style={{ width: '100%', height: '100%', borderRadius: '50%' }}
                  />
                ) : (
                  p.displayName.slice(0, 1).toUpperCase()
                )}
              </span>
              <span style={{ fontWeight: 600 }}>{p.displayName}</span>
              {p.isHost && (
                <span className="badge badge-primary" style={badgeStyle} data-testid="host-badge">
                  <Crown size={11} style={{ marginRight: '3px' }} /> {t('rooms.hostBadge')}
                </span>
              )}
              {p.isYou && (
                <span className="badge badge-secondary" style={badgeStyle}>
                  {t('rooms.youBadge')}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Actions */}
      <div style={actionsStyle}>
        <button onClick={onLeave} disabled={leaving} className="btn btn-secondary" style={{ gap: '6px' }}>
          <LogOut size={16} /> {t('rooms.leave')}
        </button>

        {view.isActive ? (
          <button
            onClick={onJoinMatch}
            className="btn btn-primary"
            style={{ gap: '8px', flex: 1 }}
            data-testid="join-match"
          >
            <Play size={18} fill="#fff" /> {t('rooms.joinMatch')}
          </button>
        ) : view.canStart ? (
          <button
            onClick={onStart}
            disabled={starting}
            className="btn btn-primary"
            style={{ gap: '8px', flex: 1 }}
            data-testid="start-game"
          >
            <Play size={18} fill="#fff" />
            {t(starting ? 'rooms.starting' : 'rooms.start')}
          </button>
        ) : view.isClosed ? (
          <span style={{ color: 'var(--text-secondary)', alignSelf: 'center' }}>
            {t(room.status === 'EXPIRED' ? 'rooms.errorClosed' : 'rooms.statusFinished')}
          </span>
        ) : (
          <span
            style={{ color: 'var(--text-secondary)', alignSelf: 'center' }}
            data-testid="waiting-for-host"
          >
            {t('rooms.waitingForHost')}
          </span>
        )}
      </div>

      <Link to={`/game/${room.game.slug}`} style={backLinkStyle}>
        <ArrowLeft size={14} /> {t('rooms.backToGame')}
      </Link>
    </div>
  );
};

const pageStyle: React.CSSProperties = {
  maxWidth: '720px',
  margin: '0 auto',
  paddingTop: '2rem',
  paddingBottom: '3rem',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  gap: '1rem',
  alignItems: 'center',
  flexWrap: 'wrap',
};

const coverStyle: React.CSSProperties = {
  width: '96px',
  height: '60px',
  objectFit: 'cover',
  borderRadius: '8px',
  border: '1px solid var(--border-color)',
};

const codeCardStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '1rem',
  flexWrap: 'wrap',
  padding: '1rem 1.25rem',
  borderRadius: '12px',
  border: '1px solid var(--border-color)',
  marginTop: '1.5rem',
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--text-secondary)',
  fontWeight: 600,
};

const codeStyle: React.CSSProperties = {
  fontSize: '1.8rem',
  fontWeight: 700,
  fontFamily: 'var(--font-display, monospace)',
  letterSpacing: '0.15em',
};

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: '0.75rem 0 0',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
};

const playerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '0.6rem 0.85rem',
  borderRadius: '10px',
  border: '1px solid var(--border-color)',
  backgroundColor: 'rgba(255,255,255,0.02)',
};

const avatarStyle: React.CSSProperties = {
  width: '30px',
  height: '30px',
  borderRadius: '50%',
  backgroundColor: 'var(--secondary)',
  color: '#fff',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 700,
  fontSize: '0.85rem',
  flexShrink: 0,
};

const badgeStyle: React.CSSProperties = {
  marginLeft: 'auto',
  display: 'inline-flex',
  alignItems: 'center',
};

const actionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '12px',
  marginTop: '2rem',
  flexWrap: 'wrap',
};

const backLinkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  marginTop: '1.5rem',
  color: 'var(--text-secondary)',
  fontSize: '0.85rem',
};
