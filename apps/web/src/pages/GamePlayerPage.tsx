import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useGames } from '../hooks/useGames';
import { ArrowLeft, Maximize2, Minimize2, RotateCcw, Volume2, VolumeX, ShieldCheck, AlertCircle } from 'lucide-react';
import { toast } from '../components/Toast';

export const GamePlayerPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { currentUser } = useAuth();
  const { games, addRecentlyPlayed } = useGames();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [loadingStep, setLoadingStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  const game = games.find(g => g.slug === slug);

  // Loading Steps Text Simulation
  const loadingTexts = [
    'Securing browser sandbox environment...',
    'Performing static scanning on files...',
    'Extracting game assets from ZIP...',
    'Validating index.html entrance...',
    'Injecting sandboxed canvas APIs...',
    'Initializing audio drivers and WebGL...',
    'VibePlay Player Ready!'
  ];

  // Guard: Game exist check
  useEffect(() => {
    if (!game) {
      toast.danger('Game could not be loaded.');
      navigate('/games');
    }
  }, [game, navigate]);

  // Loading simulation
  useEffect(() => {
    if (!game) return;

    let timer: any;
    if (loadingStep < loadingTexts.length - 1) {
      timer = setTimeout(() => {
        setLoadingStep(prev => prev + 1);
      }, 600);
    } else {
      timer = setTimeout(() => {
        setLoading(false);
        setIsPlaying(true);
        // Add to recently played in player history
        if (currentUser) {
          addRecentlyPlayed(game.id, currentUser.id);
        }
      }, 800);
    }

    return () => clearTimeout(timer);
  }, [loadingStep, game]);

  // Synthwave Canvas game simulation loop
  useEffect(() => {
    if (loading || !isPlaying || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = canvas.width = 800;
    let height = canvas.height = 450;

    let time = 0;
    let stars: { x: number; y: number; size: number; speed: number }[] = [];
    
    // Initialize stars
    for (let i = 0; i < 60; i++) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * (height / 2),
        size: Math.random() * 2,
        speed: Math.random() * 0.2 + 0.05
      });
    }

    // Grid details
    const gridRows = 20;
    const horizon = height / 2 + 30;

    const render = () => {
      ctx.fillStyle = '#080812';
      ctx.fillRect(0, 0, width, height);

      // 1. Draw space stars
      ctx.fillStyle = '#ffffff';
      stars.forEach(s => {
        ctx.fillRect(s.x, s.y, s.size, s.size);
        s.x -= s.speed;
        if (s.x < 0) s.x = width;
      });

      // 2. Draw Synthwave neon sun
      const sunGradient = ctx.createLinearGradient(0, horizon - 100, 0, horizon);
      sunGradient.addColorStop(0, '#FFC28F'); // brand-peach-400
      sunGradient.addColorStop(1, '#D98257'); // brand-peach-600
      ctx.fillStyle = sunGradient;
      ctx.beginPath();
      ctx.arc(width / 2, horizon - 5, 80, Math.PI, 0);
      ctx.fill();

      // Draw sun lines (horizontal stripes)
      ctx.fillStyle = '#080812';
      for (let y = horizon - 70; y < horizon; y += 10) {
        const heightMultiplier = (horizon - y) / 70;
        ctx.fillRect(width / 2 - 85, y, 170, 2 + heightMultiplier * 3);
      }

      // 3. Draw grid (roads)
      time += 1.5;


      ctx.strokeStyle = '#D98257'; // brand-peach-600
      ctx.lineWidth = 2;

      // Draw horizontal vanishing lines
      for (let i = 0; i < gridRows; i++) {
        // Perspective ratio formula
        const py = horizon + (Math.pow(i / gridRows, 2) * (height - horizon));
        
        ctx.strokeStyle = `rgba(217, 130, 87, ${0.15 + (i / gridRows) * 0.7})`;
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(width, py);
        ctx.stroke();
      }

      // Draw perspective vanishing rays
      const rays = 18;
      for (let i = 0; i <= rays; i++) {
        const pxStart = (width / rays) * i;
        const pxVanishing = width / 2;
        
        ctx.strokeStyle = 'rgba(246, 177, 122, 0.4)'; // Peach soft
        ctx.beginPath();
        ctx.moveTo(pxVanishing, horizon);
        ctx.lineTo(pxStart, height);
        ctx.stroke();
      }

      // 4. Draw interactive elements (moving car/cubes in grid)
      const playerX = width / 2 + Math.sin(time / 20) * 150;
      const playerY = height - 60;

      // Draw "Player Cube" car
      const playerGradient = ctx.createLinearGradient(playerX - 25, playerY, playerX + 25, playerY + 30);
      playerGradient.addColorStop(0, '#FFC28F'); // Peach-400
      playerGradient.addColorStop(1, '#D98257'); // Peach-600
      ctx.fillStyle = playerGradient;
      ctx.shadowColor = '#FFC28F';
      ctx.shadowBlur = 15;
      ctx.fillRect(playerX - 25, playerY, 50, 25);
      ctx.shadowBlur = 0; // Reset

      // Tail lights
      ctx.fillStyle = '#be123c'; // Dark red
      ctx.fillRect(playerX - 20, playerY + 5, 8, 4);
      ctx.fillRect(playerX + 12, playerY + 5, 8, 4);

      // Title HUD text
      ctx.font = 'bold 14px "Space Grotesk", sans-serif';
      ctx.fillStyle = '#F6B17A'; // Peach-500
      ctx.fillText(`MOCK GAMEPLAY PREVIEW`, 20, 30);
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#9299AD';
      ctx.fillText(`Controls: Moving cursor simulates steering`, 20, 50);

      // If audio playing, show visual waves
      if (!isMuted) {
        ctx.fillStyle = 'rgba(246, 177, 122, 0.6)'; // Peach-500 soft
        for (let i = 0; i < 8; i++) {
          const waveHeight = Math.sin((time + i * 15) / 10) * 15 + 15;
          ctx.fillRect(width - 120 + i * 8, 30 - waveHeight / 2, 4, waveHeight);
        }
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    // Resize observer fallback to keep canvas proportional
    const handleResize = () => {
      if (canvasRef.current) {
        // Keep responsive aspect ratio
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [loading, isPlaying, isMuted]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    if (!isFullscreen) {
      if (container.requestFullscreen) {
        container.requestFullscreen();
      } else if ((container as any).webkitRequestFullscreen) {
        (container as any).webkitRequestFullscreen();
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      }
      setIsFullscreen(false);
    }
  };

  // Listen to escape key exit fullscreen
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleRestart = () => {
    setLoading(true);
    setLoadingStep(0);
    setIsPlaying(false);
    toast.info('Restarting game sandbox environment...');
  };

  const handleExit = () => {
    if (game) {
      navigate(`/game/${game.slug}`);
    } else {
      navigate('/games');
    }
  };

  if (!game) return null;

  return (
    <div style={playerPageWrapperStyle}>
      
      {/* Sandbox Warning header */}
      <div style={warningsHeaderStyle}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <AlertCircle size={16} color="var(--warning)" />
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            This is a prototype game preview. Uploaded games will run inside a secure sandbox.
          </span>
        </div>
        <div style={sandboxBadgeStyle}>
          <ShieldCheck size={14} color="var(--success)" />
          <span style={{ color: 'var(--success)' }}>Secure sandbox active</span>
        </div>
      </div>

      {/* Main Play Area */}
      <div ref={containerRef} style={{ ...theaterContainerStyle, padding: isFullscreen ? '0' : '2rem' }}>
        
        {/* Top Control Bar */}
        <div style={controlBarStyle}>
          <button onClick={handleExit} style={controlBtnStyle}>
            <ArrowLeft size={16} />
            <span>Exit Game</span>
          </button>
          
          <div style={gameTitleBlockStyle}>
            <span style={{ fontWeight: 700 }}>{game.title}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>by @{game.creatorName}</span>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={handleRestart} style={controlIconBtnStyle} title="Restart Game">
              <RotateCcw size={16} />
            </button>
            <button onClick={() => setIsMuted(!isMuted)} style={controlIconBtnStyle} title={isMuted ? 'Unmute Audio' : 'Mute Audio'}>
              {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <button onClick={toggleFullscreen} style={controlIconBtnStyle} title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}>
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>
        </div>

        {/* Display Wrapper */}
        <div style={displayWrapperStyle}>
          
          {/* Loading Layer */}
          {loading && (
            <div style={loadingLayerStyle}>
              <div style={spinnerStyle}></div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.01em' }}>Launching Game Build</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
                {loadingTexts[loadingStep]}
              </p>
              <div style={progressOuterStyle}>
                <div style={{ ...progressInnerStyle, width: `${((loadingStep + 1) / loadingTexts.length) * 100}%` }}></div>
              </div>
            </div>
          )}

          {/* Interactive Simulated Game Canvas */}
          {!loading && isPlaying && (
            <canvas ref={canvasRef} style={canvasStyle}></canvas>
          )}

        </div>

      </div>

    </div>
  );
};

// Styles
const playerPageWrapperStyle: React.CSSProperties = {
  backgroundColor: '#05070D',
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column'
};

const warningsHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 1.5rem',
  borderBottom: '1px solid var(--border-color)',
  backgroundColor: 'var(--bg-main)',
  flexWrap: 'wrap',
  gap: '8px'
};

const sandboxBadgeStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '3px 8px',
  borderRadius: '4px',
  backgroundColor: 'rgba(61, 220, 151, 0.1)',
  fontSize: '0.75rem',
  fontWeight: 600
};

const theaterContainerStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  backgroundColor: '#000000',
  position: 'relative'
};

const controlBarStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '800px',
  height: '48px',
  backgroundColor: 'var(--bg-card)',
  border: '1px solid var(--border-color)',
  borderBottom: 'none',
  borderTopLeftRadius: '8px',
  borderTopRightRadius: '8px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 1rem',
  zIndex: 10
};

const controlBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  background: 'none',
  border: 'none',
  color: 'var(--text-primary)',
  fontSize: '0.85rem',
  fontWeight: 600,
  cursor: 'pointer'
};

const gameTitleBlockStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  fontSize: '0.85rem',
  lineHeight: 1.2
};

const controlIconBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  padding: '4px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
};

const displayWrapperStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '800px',
  height: '450px',
  backgroundColor: '#080A12',
  border: '1px solid var(--border-color)',
  borderBottomLeftRadius: '8px',
  borderBottomRightRadius: '8px',
  overflow: 'hidden',
  position: 'relative',
  boxShadow: 'var(--shadow-lg)'
};

const loadingLayerStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: '#080A12',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 20
};

const spinnerStyle: React.CSSProperties = {
  width: '40px',
  height: '40px',
  borderRadius: '50%',
  border: '3px solid rgba(124, 92, 255, 0.1)',
  borderTopColor: 'var(--primary)',
  animation: 'pulse 1s infinite linear', // Handled simple spinner or keyframe in CSS
  marginBottom: '1rem'
};

const progressOuterStyle: React.CSSProperties = {
  width: '240px',
  height: '4px',
  backgroundColor: 'var(--bg-hover)',
  borderRadius: '2px',
  marginTop: '1.25rem',
  overflow: 'hidden'
};

const progressInnerStyle: React.CSSProperties = {
  height: '100%',
  backgroundColor: 'var(--secondary)',
  transition: 'width 0.3s ease'
};

const canvasStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'block',
  cursor: 'crosshair'
};
