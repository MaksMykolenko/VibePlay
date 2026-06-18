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

  // Mouse dragging references
  const isDown = useRef(false);
  const startX = useRef(0);
  const scrollLeftStart = useRef(0);
  const isDragged = useRef(false);

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

  // Mouse drag-to-scroll handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return; // Left click only
    const el = viewportRef.current;
    if (!el) return;

    isDown.current = true;
    startX.current = e.pageX - el.offsetLeft;
    scrollLeftStart.current = el.scrollLeft;
    isDragged.current = false;

    el.style.cursor = 'grabbing';
    el.style.userSelect = 'none';
    el.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDown.current) return;
    const el = viewportRef.current;
    if (!el) return;

    const x = e.pageX - el.offsetLeft;
    const walk = (x - startX.current) * 1.5; // Drag speed multiplier

    if (Math.abs(walk) > 5) {
      isDragged.current = true;
    }

    el.scrollLeft = scrollLeftStart.current - walk;
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDown.current) return;
    isDown.current = false;

    const el = viewportRef.current;
    if (el) {
      el.style.cursor = '';
      el.style.removeProperty('user-select');
      el.releasePointerCapture(e.pointerId);
    }
  };

  const handlePointerCancel = (e: React.PointerEvent) => {
    if (!isDown.current) return;
    isDown.current = false;

    const el = viewportRef.current;
    if (el) {
      el.style.cursor = '';
      el.style.removeProperty('user-select');
      el.releasePointerCapture(e.pointerId);
    }
  };

  // Prevent link click if dragging occurred
  const handleCardClickCapture = (e: React.MouseEvent) => {
    if (isDragged.current) {
      e.preventDefault();
      e.stopPropagation();
      isDragged.current = false; // reset
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

        {/* Viewport container */}
        <div
          ref={viewportRef}
          className="game-carousel__viewport"
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          tabIndex={0}
          role="region"
          aria-label={`${title} carousel`}
          style={{ cursor: showArrows ? 'grab' : 'default' }}
        >
          <div className="game-carousel__track">
            {gamesList.map((game) => (
              <div
                key={game.id}
                className="game-carousel__item"
                onClickCapture={handleCardClickCapture}
              >
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
