import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Game } from '../types';
import { Play, ThumbsUp, Gamepad } from 'lucide-react';
import { useI18n } from '../i18n/useI18n';

interface GameCardProps {
  game: Game;
  variant?: 'default' | 'continue';
}

export const GameCard: React.FC<GameCardProps> = ({ game, variant = 'default' }) => {
  const { t } = useI18n();
  const [imgError, setImgError] = useState(false);

  const formatPlays = (plays: number) => {
    if (plays >= 1000000) return `${(plays / 1000000).toFixed(1)}M`;
    if (plays >= 1000) return `${(plays / 1000).toFixed(1)}K`;
    return plays.toString();
  };

  const likeRatio =
    game.likes + game.dislikes > 0
      ? Math.round((game.likes / (game.likes + game.dislikes)) * 100)
      : 100;

  // Single badge priority logic: Featured > New > AI-assisted > Multiplayer
  const getBadge = () => {
    if (game.isFeatured) {
      return { text: 'Featured', className: 'badge-primary' };
    }

    // Check if updated in the last 30 days
    const gameDate = new Date(game.updatedAt).getTime();
    const now = new Date().getTime();
    const isNew = now - gameDate < 30 * 24 * 60 * 60 * 1000;
    if (isNew) {
      return { text: 'New', className: 'badge-success' };
    }

    if (game.aiDisclosure && game.aiDisclosure !== 'no') {
      return { text: 'AI', className: 'badge-secondary' };
    }

    if (game.multiplayer) {
      return { text: 'Multiplayer', className: 'badge-warning' };
    }

    return null;
  };

  const badge = getBadge();

  return (
    <div
      style={cardStyle}
      className={`game-card animate-fade ${variant === 'continue' ? 'game-card--continue' : ''}`}
    >
      {/* Stretched Link — covers the entire card, z-index: 1 */}
      <Link
        className="game-card__stretched-link"
        to={`/game/${game.slug}`}
        aria-label={`Open ${game.title} details`}
        tabIndex={0}
      />

      {/* Cover Image Container (16:9 aspect ratio) — decorative, pointer-events: none */}
      <div style={coverWrapperStyle} className="game-card__cover-wrapper">
        {imgError ? (
          <div style={fallbackContainerStyle} className="game-card__fallback">
            <Gamepad size={32} color="rgba(255, 255, 255, 0.25)" />
            <span style={fallbackTitleStyle} className="game-card__fallback-title">
              {game.title}
            </span>
          </div>
        ) : (
          <img
            src={game.coverUrl}
            alt={game.title}
            style={coverImgStyle}
            className="game-card__cover"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        )}

        {/* Play Hover Overlay — purely decorative */}
        <div style={overlayStyle} className="game-card-overlay">
          <div style={playBtnCircleStyle}>
            <Play size={18} fill="#fff" color="#fff" style={{ transform: 'translateX(1px)' }} />
          </div>
        </div>

        {/* Badge Overlay — decorative, pointer-events: none */}
        {badge && (
          <div style={badgeWrapperStyle} className="game-card__badge-wrapper">
            <span
              className={`badge ${badge.className}`}
              style={{ fontSize: '0.65rem', padding: '0.2rem 0.5rem' }}
            >
              {badge.text}
            </span>
          </div>
        )}
      </div>

      {/* Info Area */}
      <div style={infoContainerStyle} className="game-card__info">
        {/* Title — rendered as span, the stretched link handles navigation */}
        <span style={titleStyle} className="game-card__title" title={game.title}>
          {game.title}
        </span>

        {variant === 'continue' ? (
          <div className="game-card__continue-action-row">
            <span className="game-card__last-played mobile-only">Active play</span>
            <span className="game-card__meta desktop-only" style={metaRowStyle}>
              <ThumbsUp size={11} style={{ marginRight: '3px' }} />
              {likeRatio}% • {t('card.plays', { count: formatPlays(game.plays) })}
            </span>
            {/* Continue button — elevated above stretched link */}
            <Link to={`/play/${game.slug}`} className="game-card__continue-btn game-card__play-link">
              <span>{t('card.continue')}</span>
              <Play size={10} fill="currentColor" style={{ marginLeft: '2px' }} />
            </Link>
          </div>
        ) : (
          <div style={metaRowStyle} className="game-card__meta">
            <span style={ratingStyle} className="game-card__rating">
              <ThumbsUp size={11} style={{ marginRight: '3px' }} />
              {likeRatio}%
            </span>
            <span style={dotDividerStyle} className="game-card__divider">
              •
            </span>
            <span style={playsStyle} className="game-card__plays">
              {t('card.plays', { count: formatPlays(game.plays) })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

// Styles
const cardStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-card)',
  border: '1px solid var(--border-color)',
  borderRadius: '10px',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  transition: 'transform 0.2s ease, border-color 0.2s ease',
  position: 'relative',
  height: '100%',
};

const coverWrapperStyle: React.CSSProperties = {
  width: '100%',
  paddingTop: '56.25%', // Strict 16:9 Aspect Ratio
  position: 'relative',
  overflow: 'hidden',
  backgroundColor: '#0c0e17',
  pointerEvents: 'none',
};

const coverImgStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  transition: 'transform 0.25s ease',
};

const fallbackContainerStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  padding: '1rem',
  background: 'linear-gradient(135deg, #151928 0%, #080a12 100%)',
  textAlign: 'center',
};

const fallbackTitleStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  fontWeight: 700,
  color: 'var(--text-secondary)',
  maxWidth: '90%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(8, 10, 18, 0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  opacity: 0,
  transition: 'opacity 0.2s ease',
  pointerEvents: 'none',
};

const playBtnCircleStyle: React.CSSProperties = {
  width: '42px',
  height: '42px',
  borderRadius: '50%',
  background: 'var(--gradient)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: 'var(--shadow-accent)',
  transform: 'scale(0.9)',
  transition: 'transform 0.2s ease',
};

const badgeWrapperStyle: React.CSSProperties = {
  position: 'absolute',
  top: '8px',
  left: '8px',
  zIndex: 4,
  pointerEvents: 'none',
};

const infoContainerStyle: React.CSSProperties = {
  padding: '0.8rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
  flex: 1,
  pointerEvents: 'none',
  position: 'relative',
};

const titleStyle: React.CSSProperties = {
  fontSize: '0.95rem',
  fontWeight: 700,
  color: 'var(--text-primary)',
  display: '-webkit-box',
  WebkitLineClamp: 1,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  lineHeight: 1.3,
};

const metaRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  fontSize: '0.75rem',
  color: 'var(--text-secondary)',
};

const ratingStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  fontWeight: 600,
  color: 'var(--success)',
};

const dotDividerStyle: React.CSSProperties = {
  margin: '0 6px',
  opacity: 0.5,
};

const playsStyle: React.CSSProperties = {
  fontWeight: 500,
};
