import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useGames } from '../hooks/useGames';
import { GameCard } from '../components/GameCard';
import { Search, RefreshCw, Gamepad, SlidersHorizontal, Check, X } from 'lucide-react';
import { toast } from '../components/toastEvents';

export const GamesPage: React.FC = () => {
  const { games } = useGames();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL parameters initial state
  const initialCategory = searchParams.get('category') || '';
  const initialSearch = searchParams.get('search') || '';
  const initialAi = searchParams.get('ai') === 'true';

  // Filter States
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [selectedDevice, setSelectedDevice] = useState<string>('all');
  const [selectedAi, setSelectedAi] = useState<string>(initialAi ? 'assisted' : 'all');
  const [isMultiplayer, setIsMultiplayer] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<string>('trending');

  // More Filters popover state
  const [showMore, setShowMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // Load more pagination
  const [visibleCount, setVisibleCount] = useState(12);

  // Click outside listener for the "More Filters" popover
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
        setShowMore(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Determine if any filter is active (to show the "Reset Filters" button)
  const isAnyFilterActive =
    searchTerm !== '' ||
    selectedCategory !== '' ||
    selectedDevice !== 'all' ||
    selectedAi !== 'all' ||
    isMultiplayer ||
    sortBy !== 'trending';

  // Reset all filters
  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedCategory('');
    setSelectedDevice('all');
    setSelectedAi('all');
    setIsMultiplayer(false);
    setSortBy('trending');
    setSearchParams({});
    toast.success('Filters cleared.');
  };

  // Filtered games logic
  const filteredGames = games
    .filter((g) => g.status === 'published')
    .filter((g) => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        g.title.toLowerCase().includes(term) ||
        g.shortDescription.toLowerCase().includes(term) ||
        g.creatorName.toLowerCase().includes(term) ||
        g.tags.some((t) => t.toLowerCase().includes(term))
      );
    })
    .filter((g) => {
      if (!selectedCategory) return true;
      return g.category.toLowerCase() === selectedCategory.toLowerCase();
    })
    .filter((g) => {
      if (selectedDevice === 'all') return true;
      return g.devices.includes(selectedDevice);
    })
    .filter((g) => {
      if (selectedAi === 'all') return true;
      if (selectedAi === 'no') return g.aiDisclosure === 'no';
      if (selectedAi === 'assisted')
        return g.aiDisclosure === 'assisted' || g.aiDisclosure === 'generated';
      return g.aiDisclosure === 'generated';
    })
    .filter((g) => {
      if (!isMultiplayer) return true;
      return g.multiplayer;
    })
    .sort((a, b) => {
      if (sortBy === 'plays') return b.plays - a.plays;
      if (sortBy === 'newest')
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      if (sortBy === 'rating') {
        const ratingA = a.likes + a.dislikes > 0 ? a.likes / (a.likes + a.dislikes) : 1;
        const ratingB = b.likes + b.dislikes > 0 ? b.likes / (b.likes + b.dislikes) : 1;
        return ratingB - ratingA;
      }
      // Trending (default sorting formula)
      return b.plays * 0.7 + b.likes * 10 - (a.plays * 0.7 + a.likes * 10);
    });

  const handleLoadMore = () => {
    setVisibleCount((prev) => prev + 8);
    toast.info('Loading next page...');
  };

  return (
    <div style={containerStyle}>
      {/* Title & Description */}
      <div style={headerBlockStyle}>
        <div>
          <h1 style={titleStyle}>Browse Games</h1>
          <p style={subtitleStyle}>
            Discover and launch browser creations instantly. No client required.
          </p>
        </div>

        {/* Local Search and Sort dropdown */}
        <div style={searchRowStyle}>
          <div style={inputContainerStyle}>
            <Search size={14} style={searchIconStyle} />
            <input
              type="text"
              placeholder="Search title, tags, creators..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={searchInputStyle}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                style={clearSearchBtnStyle}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Horizontal Toolbar Filters */}
      <div style={toolbarStyle} className="bg-glass">
        <div style={filtersGroupStyle}>
          {/* Category Dropdown */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="form-input form-select"
            style={filterSelectStyle}
          >
            <option value="">All Categories</option>
            {['Action', 'Adventure', 'Horror', 'Simulator', 'Racing', 'Puzzle', 'Experimental'].map(
              (cat) => (
                <option key={cat} value={cat.toLowerCase()}>
                  {cat}
                </option>
              ),
            )}
          </select>

          {/* Device Dropdown */}
          <select
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
            className="form-input form-select"
            style={filterSelectStyle}
          >
            <option value="all">Any Device</option>
            <option value="desktop">Desktop-Only</option>
            <option value="mobile">Mobile-Friendly</option>
            <option value="tablet">Tablet-Friendly</option>
          </select>

          {/* AI Disclosure Dropdown */}
          <select
            value={selectedAi}
            onChange={(e) => setSelectedAi(e.target.value)}
            className="form-input form-select"
            style={filterSelectStyle}
          >
            <option value="all">AI Usage: All</option>
            <option value="no">Human-Made Only</option>
            <option value="assisted">AI-Assisted</option>
          </select>

          {/* Multiplayer Toggle */}
          <button
            onClick={() => setIsMultiplayer(!isMultiplayer)}
            style={{
              ...toggleBtnStyle,
              backgroundColor: isMultiplayer ? 'rgba(124, 92, 255, 0.15)' : 'transparent',
              borderColor: isMultiplayer ? 'var(--primary)' : 'var(--border-color)',
              color: isMultiplayer ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            <span>Multiplayer</span>
            {isMultiplayer && <Check size={12} color="var(--primary)" />}
          </button>

          {/* More Filters Popover Trigger */}
          <div ref={moreRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowMore(!showMore)}
              className="btn btn-secondary btn-sm"
              style={moreBtnStyle}
            >
              <SlidersHorizontal size={14} />
              <span>More Filters</span>
            </button>

            {showMore && (
              <div style={popoverStyle} className="bg-glass">
                <div style={popoverItemStyle}>
                  <label className="form-label" style={{ fontWeight: 600 }}>
                    Sort By
                  </label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="form-input form-select"
                    style={{ fontSize: '0.8rem', padding: '0.4rem 2rem 0.4rem 0.8rem' }}
                  >
                    <option value="trending">Trending Now</option>
                    <option value="plays">Most Played</option>
                    <option value="newest">New Releases</option>
                    <option value="rating">Top Rated</option>
                  </select>
                </div>

                <div style={popoverItemStyle}>
                  <label className="form-label" style={{ fontWeight: 600 }}>
                    AI Strictness
                  </label>
                  <select
                    value={selectedAi}
                    onChange={(e) => setSelectedAi(e.target.value)}
                    className="form-input form-select"
                    style={{ fontSize: '0.8rem', padding: '0.4rem 2rem 0.4rem 0.8rem' }}
                  >
                    <option value="all">Allow All</option>
                    <option value="no">Strictly Human-Made</option>
                    <option value="assisted">AI Assisted/Generated</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Reset Active Filters Button */}
        {isAnyFilterActive && (
          <button onClick={handleResetFilters} style={resetBtnStyle}>
            Reset Filters
          </button>
        )}
      </div>

      {/* Grid container (Fills available space) */}
      <div style={{ flex: 1 }}>
        {filteredGames.length === 0 ? (
          <div style={emptyContainerStyle}>
            <Gamepad
              size={48}
              color="var(--text-secondary)"
              style={{ opacity: 0.3, marginBottom: '1rem' }}
            />
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>No games matched your criteria</h3>
            <p
              style={{
                color: 'var(--text-secondary)',
                fontSize: '0.85rem',
                maxWidth: '340px',
                margin: '0.5rem 0 1.5rem',
                lineHeight: 1.5,
              }}
            >
              Try removing category filters, checking other compatibility modes, or search for
              another keyword.
            </p>
            <button onClick={handleResetFilters} className="btn btn-primary btn-sm">
              Clear Active Filters
            </button>
          </div>
        ) : (
          <>
            {/* Custom responsive minmax(210px, 1fr) grid */}
            <div style={responsiveGridStyle}>
              {filteredGames.slice(0, visibleCount).map((game) => (
                <GameCard key={game.id} game={game} />
              ))}
            </div>

            {/* Load More Pagination */}
            {filteredGames.length > visibleCount && (
              <div style={loadMoreContainerStyle}>
                <button
                  onClick={handleLoadMore}
                  className="btn btn-secondary"
                  style={{ gap: '8px' }}
                >
                  <RefreshCw size={16} />
                  <span>Load More Games</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// Styles
const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1.5rem',
  width: '100%',
  flex: 1,
};

const headerBlockStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '1rem',
};

const titleStyle: React.CSSProperties = {
  fontSize: '1.75rem',
  fontWeight: 700,
  letterSpacing: '-0.02em',
};

const subtitleStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  color: 'var(--text-secondary)',
  marginTop: '4px',
};

const searchRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  width: '100%',
  maxWidth: '320px',
};

const inputContainerStyle: React.CSSProperties = {
  position: 'relative',
  flex: 1,
};

const searchIconStyle: React.CSSProperties = {
  position: 'absolute',
  left: '12px',
  top: '50%',
  transform: 'translateY(-50%)',
  color: 'var(--text-secondary)',
  pointerEvents: 'none',
};

const searchInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 2.2rem 0.5rem 2.2rem',
  backgroundColor: 'var(--bg-card)',
  border: '1px solid var(--border-color)',
  borderRadius: '8px',
  color: 'var(--text-primary)',
  fontSize: '0.85rem',
  outline: 'none',
};

const clearSearchBtnStyle: React.CSSProperties = {
  position: 'absolute',
  right: '10px',
  top: '50%',
  transform: 'translateY(-50%)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text-secondary)',
  padding: '2px',
  display: 'flex',
  alignItems: 'center',
};

const toolbarStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: '12px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '1rem',
  border: '1px solid var(--border-color)',
};

const filtersGroupStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flexWrap: 'wrap',
};

const filterSelectStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  padding: '0.4rem 2rem 0.4rem 0.8rem',
  width: 'auto',
  backgroundColor: 'var(--bg-card)',
  borderRadius: '6px',
  border: '1px solid var(--border-color)',
  cursor: 'pointer',
};

const toggleBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '0.4rem 0.8rem',
  borderRadius: '6px',
  border: '1px solid var(--border-color)',
  fontSize: '0.8rem',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
};

const moreBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '0.4rem 0.8rem',
  fontSize: '0.8rem',
  fontWeight: 600,
  backgroundColor: 'var(--bg-card)',
  borderColor: 'var(--border-color)',
};

const resetBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: '0.75rem',
  color: 'var(--secondary)',
  fontWeight: 600,
  cursor: 'pointer',
  padding: '4px 8px',
};

const popoverStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  marginTop: '8px',
  width: '200px',
  borderRadius: '8px',
  border: '1px solid var(--border-color)',
  padding: '12px',
  boxShadow: 'var(--shadow-lg)',
  zIndex: 100,
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
};

const popoverItemStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

const responsiveGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
  gap: '1.25rem',
  width: '100%',
};

const emptyContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '6rem 2rem',
  textAlign: 'center',
  backgroundColor: 'var(--bg-card)',
  border: '1px dashed var(--border-color)',
  borderRadius: '12px',
  margin: '1rem 0',
};

const loadMoreContainerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  marginTop: '3rem',
};
