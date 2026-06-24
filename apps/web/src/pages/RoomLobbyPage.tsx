import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import type { RoomDto } from '@vibeplay/shared';
import { Loader } from 'lucide-react';
import { api } from '../lib/api';
import { deriveLobbyView, roomErrorKey } from '../lib/rooms';
import { RoomLobbyView } from '../components/RoomLobbyView';
import { toast } from '../components/toastEvents';
import { useI18n } from '../i18n/useI18n';

const POLL_INTERVAL_MS = 2500;

/**
 * VibePlay-owned multiplayer lobby (container). Loads room info, joins the viewer
 * (user or guest) when allowed, polls while WAITING, and lets the host start the
 * match. All privileged calls go through the VibePlay API; no game code runs here.
 * Presentation lives in <RoomLobbyView /> so it can be tested in isolation.
 */
export const RoomLobbyPage: React.FC = () => {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();

  const [room, setRoom] = useState<RoomDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const joinAttempted = useRef(false);

  // Initial load + auto-join (when the room is joinable and we're not a member).
  useEffect(() => {
    if (!roomCode) return;
    let active = true;
    void (async () => {
      setLoading(true);
      setErrorKey(null);
      try {
        let r = await api.getRoom(roomCode);
        const view = deriveLobbyView(r);
        if (!view.isMember && !joinAttempted.current && r.status === 'WAITING' && r.canJoin) {
          joinAttempted.current = true;
          try {
            const joined = await api.joinRoom(roomCode);
            r = joined.room;
          } catch (joinErr) {
            // Couldn't join (race to full, etc.) — keep showing the read-only room
            // with a clear message rather than erroring out.
            toast.warning(t(roomErrorKey(joinErr)));
          }
        }
        if (active) setRoom(r);
      } catch (err) {
        if (active) setErrorKey(roomErrorKey(err));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [roomCode, t]);

  // Poll for lobby changes (player list / status) only while WAITING.
  const shouldPoll = room?.status === 'WAITING';
  useEffect(() => {
    if (!roomCode || !shouldPoll) return;
    const id = window.setInterval(() => {
      api
        .getRoom(roomCode)
        .then((r) => setRoom(r))
        .catch(() => {
          /* transient poll errors are ignored; next tick retries */
        });
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [roomCode, shouldPoll]);

  const goToMatch = useCallback(
    (playPathOrUrl: string, slug: string) => {
      // Honor the backend's playUrl but navigate by path (origin-agnostic).
      try {
        const u = new URL(playPathOrUrl);
        navigate(u.pathname + u.search);
      } catch {
        navigate(`/play/${slug}?room=${roomCode}`);
      }
    },
    [navigate, roomCode],
  );

  const handleStart = async () => {
    if (!roomCode || !room || starting) return;
    setStarting(true);
    try {
      const res = await api.startRoom(roomCode);
      goToMatch(res.playUrl, room.game.slug);
    } catch (err) {
      toast.danger(t(roomErrorKey(err)));
      setStarting(false);
    }
  };

  const handleLeave = async () => {
    if (!roomCode || !room || leaving) return;
    setLeaving(true);
    const slug = room.game.slug;
    try {
      await api.leaveRoom(roomCode);
    } catch {
      /* leaving is best-effort; navigate away regardless */
    }
    navigate(`/game/${slug}`);
  };

  const handleCopyInvite = async () => {
    if (!roomCode) return;
    const url = `${window.location.origin}/rooms/${roomCode}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('rooms.inviteCopied'));
    } catch {
      // Clipboard can be unavailable (insecure context); show the URL to copy.
      toast.info(url);
    }
  };

  if (loading) {
    return (
      <div style={centerStyle} data-testid="room-loading">
        <Loader size={28} />
        <p style={{ color: 'var(--text-secondary)' }}>{t('rooms.loading')}</p>
      </div>
    );
  }

  if (errorKey || !room) {
    return (
      <div style={centerStyle}>
        <h2>{t('rooms.lobbyTitle')}</h2>
        <p style={{ color: 'var(--text-secondary)' }}>{t(errorKey ?? 'rooms.errorGeneric')}</p>
        <Link to="/games" className="btn btn-primary" style={{ marginTop: '1rem' }}>
          {t('game.backToCatalog')}
        </Link>
      </div>
    );
  }

  const view = deriveLobbyView(room);

  return (
    <RoomLobbyView
      room={room}
      view={view}
      starting={starting}
      leaving={leaving}
      onCopyInvite={() => void handleCopyInvite()}
      onLeave={() => void handleLeave()}
      onStart={() => void handleStart()}
      onJoinMatch={() => goToMatch(`/play/${room.game.slug}?room=${room.roomCode}`, room.game.slug)}
      t={t}
    />
  );
};

const centerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.75rem',
  minHeight: 'calc(100vh - 200px)',
  textAlign: 'center',
  padding: '2rem',
};
