import React, { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { GameCard } from './GameCard';
import type { Game } from '../types';
import { useI18n } from '../i18n/useI18n';

interface GameCarouselProps {
  title: string;
  gamesList: Game[];
  linkTo?: string;
  emptyText?: string;
  variant?: 'default' | 'continue';
}

export const GameCarousel: React.FC<GameCarouselProps> = ({
  title,
  gamesList,
  linkTo,
  emptyText,
  variant = 'default',
}) => {
  const { t } = useI18n();
  const isContinue = variant === 'continue';
  const viewportRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const [showArrows, setShowArrows] = useState(false);

  // Mouse dragging state — track whether a real drag happened
  const isDown = useRef(false);
  const startX = useRef(0);
  const scrollLeftStart = useRef(0);
  // When true, the current gesture was a drag and link clicks should be blocked
  const wasDragged = useRef(false);

  const updateScrollButtons = () => {
    const el = viewportRef.current;
    if (!el) return;

    const tolerance = 4; // subpixel tolerance
    const scrollLeft = el.scrollLeft;
    const clientWidth = el.clientWidth;
    const scrollWidth = el.scrollWidth;

    setAtStart(scrollLeft <= tolerance);
    setAtEnd(scrollLeft + clientWidth >= scrollWidth - tolerance);
    setShowArrows(scrollWidth > clientWidth + tolerance);
  };

  // Listen for scroll events
  const handleScroll = () => {
    updateScrollButtons();
  };

  // Scroll manually via buttons
  const scrollCarousel = (direction: 'prev' | 'next') => {
    const el = viewportRef.current;
    if (!el) return;

    const scrollDistance = el.clientWidth * 0.85;
    el.scrollBy({
      left: direction === 'next' ? scrollDistance : -scrollDistance,
      behavior: 'smooth',
    });
  };

  // Keyboard navigation when focused
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const el = viewportRef.current;
    if (!el) return;

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      scrollCarousel('next');
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      scrollCarousel('prev');
    }
  };

  // Mouse drag-to-scroll: use mousedown/move/up instead of pointer capture
  // to avoid capturing events away from child <a> elements.
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only initiate drag on primary button and when directly on the viewport/track
    // (not on interactive children like links/buttons)
    if (e.button !== 0) return;
    const el = viewportRef.current;
    if (!el) return;

    isDown.current = true;
    startX.current = e.pageX;
    scrollLeftStart.current = el.scrollLeft;
    wasDragged.current = false;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDown.current) return;
    const el = viewportRef.current;
    if (!el) return;

    const dx = e.pageX - startX.current;

    // Only start dragging after a meaningful threshold (8px)
    if (Math.abs(dx) > 8) {
      wasDragged.current = true;
      el.style.cursor = 'grabbing';
      el.style.userSelect = 'none';
    }

    if (wasDragged.current) {
      el.scrollLeft = scrollLeftStart.current - dx * 1.5;
    }
  };

  const handleMouseUp = () => {
    if (!isDown.current) return;
    isDown.current = false;

    const el = viewportRef.current;
    if (el) {
      el.style.cursor = '';
      el.style.removeProperty('user-select');
    }
  };

  const handleMouseLeave = () => {
    if (!isDown.current) return;
    isDown.current = false;

    const el = viewportRef.current;
    if (el) {
      el.style.cursor = '';
      el.style.removeProperty('user-select');
    }
  };

  // Block click ONLY when a real drag just happened (threshold was crossed)
  const handleClickCapture = (e: React.MouseEvent) => {
    if (wasDragged.current) {
      e.preventDefault();
      e.stopPropagation();
      wasDragged.current = false;
    }
  };

  // Watch resize (sidebar collapse/expand) and list changes
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    updateScrollButtons();

    const observer = new ResizeObserver(() => {
      updateScrollButtons();
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [gamesList]);

  if (gamesList.length === 0) {
    if (isContinue) {
      return null; // Don't render empty Continue Playing section
    }
    return (
      <section className="game-carousel">
        <div className="game-carousel__header">
          <h2>{title}</h2>
        </div>
        <div style={{ padding: '1rem 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          {emptyText ?? t('carousel.empty')}
        </div>
      </section>
    );
  }

  return (
    <section
      className={`game-carousel ${isContinue ? 'game-carousel--continue' : ''}`}
      aria-label={title}
    >
      <div className="game-carousel__header">
        <h2>{title}</h2>
        {linkTo && (
          <Link
            to={linkTo}
            aria-label={
              isContinue ? t('carousel.viewHistory') : t('carousel.seeAllLabel', { title })
            }
          >
            <span>{t(isContinue ? 'carousel.viewHistory' : 'carousel.seeAll')}</span>
            <ChevronRight size={14} />
          </Link>
        )}
      </div>

      <div
        className={`game-carousel__body ${!atStart ? 'has-left-fade' : ''} ${!atEnd && showArrows ? 'has-right-fade' : ''}`}
      >
        {/* Previous Button */}
        {showArrows && (
          <button
            onClick={() => scrollCarousel('prev')}
            className="game-carousel__arrow game-carousel__arrow--prev"
            aria-label={t('carousel.previous')}
            disabled={atStart}
          >
            <ChevronLeft size={20} />
          </button>
        )}

        {/* Viewport container — drag-to-scroll via mouse events (no pointer capture) */}
        <div
          ref={viewportRef}
          className="game-carousel__viewport"
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onClickCapture={handleClickCapture}
          tabIndex={0}
          role="region"
          aria-label={`${title} carousel`}
          style={{ cursor: showArrows ? 'grab' : 'default' }}
        >
          <div className="game-carousel__track">
            {gamesList.map((game) => (
              <div key={game.id} className="game-carousel__item">
                <GameCard game={game} variant={isContinue ? 'continue' : 'default'} />
              </div>
            ))}
          </div>
        </div>

        {/* Next Button */}
        {showArrows && (
          <button
            onClick={() => scrollCarousel('next')}
            className="game-carousel__arrow game-carousel__arrow--next"
            aria-label={t('carousel.next')}
            disabled={atEnd}
          >
            <ChevronRight size={20} />
          </button>
        )}
      </div>
    </section>
  );
};
