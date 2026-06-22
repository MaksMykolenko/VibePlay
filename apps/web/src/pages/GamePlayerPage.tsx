import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  isAllowedGameLaunchUrl,
  type LaunchDescriptorDto,
  type LocalSaveAvailablePayload,
} from '@vibeplay/shared';
import { GameBridge, type HostSaveAdapter } from '@vibeplay/sdk';
import { useAuth } from '../hooks/useAuth';
import { useGames } from '../hooks/useGames';
import { api } from '../lib/api';
import { GAME_ORIGIN } from '../lib/appMode';
import { createCloudSaveAdapter } from '../lib/cloudSaveAdapter';
import { CloudSaveCTA } from '../components/CloudSaveCTA';
import { CloudSaveSyncPrompt } from '../components/CloudSaveSyncPrompt';
import { trackEvent } from '../lib/analytics';
import {
  canShowCta,
  suppressCta,
  markSignupIntent,
  consumeSignupIntent,
  canOfferCloudSaveSync,
  CTA_PLAY_THRESHOLD_MS,
} from '../lib/cloudSaveCta';
import { withReturnTo } from '../lib/returnTo';

// Module-local static flag: import.meta.env.APP_MODE is folded by Vite at
// build time, so every demo-only branch below (fake loading texts, canvas
// simulation) is dead-code-eliminated from the real bundle.
const IS_DEMO = import.meta.env.APP_MODE === 'demo';
import {
  ArrowLeft,
  Maximize2,
  Minimize2,
  RotateCcw,
  Volume2,
  VolumeX,
  ShieldCheck,
  AlertCircle,
  Cloud,
} from 'lucide-react';
import { toast } from '../components/toastEvents';
import { useI18n } from '../i18n/useI18n';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

const LOADING_TEXTS = [
  'Securing browser sandbox environment...',
  'Performing static scanning on files...',
  'Extracting game assets from ZIP...',
  'Validating index.html entrance...',
  'Injecting sandboxed canvas APIs...',
  'Initializing audio drivers and WebGL...',
  'VibePlay Player Ready!',
];

interface WebkitFullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

interface WebkitFullscreenDocument extends Document {
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenElement?: Element | null;
}

export const GamePlayerPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { currentUser } = useAuth();
  const { games, isLoading, addRecentlyPlayed } = useGames();
  const navigate = useNavigate();
  const { t } = useI18n();

  const [loading, setLoading] = useState(true);
  const [loadingStep, setLoadingStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [launch, setLaunch] = useState<LaunchDescriptorDto | null>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const [sdkReady, setSdkReady] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const translateRef = useRef(t);

  useEffect(() => {
    translateRef.current = t;
  }, [t]);

  const game = games.find((g) => g.slug === slug);
  const gameId = game?.id;
  const launchLoading = IS_DEMO ? loading : launch === null;
  const isGuest = !currentUser;

  // --- cloud-save conversion CTA + guest-save sync (Phases 3-4) ------------
  const [ctaVisible, setCtaVisible] = useState(false);
  const [syncPrompt, setSyncPrompt] = useState<{ hasCloud: boolean } | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const bridgeRef = useRef<GameBridge | null>(null);
  const ctaShownRef = useRef(false);
  const syncOfferedRef = useRef(false);
  const localSaveDataRef = useRef<{ data: unknown; schemaVersion?: number } | null>(null);

  // Show the soft CTA (guests only, never blocking, respect cooldown). The
  // trigger (time / progress / guest-save) is decided by callers.
  const requestCta = useCallback(
    (trigger: string) => {
      if (IS_DEMO || currentUser) return; // guests only
      if (!canShowCta(true)) return; // dismissed this session or within cooldown
      setCtaVisible(true);
      if (!ctaShownRef.current) {
        ctaShownRef.current = true;
        const params = {
          game_id: gameId ?? '',
          game_slug: slug ?? '',
          source: trigger,
          cta_location: 'play_overlay',
          logged_in: false,
        } as const;
        trackEvent('cloud_save_cta_shown', params);
        trackEvent('signup_cta_shown', params);
      }
    },
    [currentUser, gameId, slug],
  );

  const handleCtaCreateAccount = useCallback(() => {
    trackEvent('signup_cta_clicked', {
      game_id: gameId ?? '',
      game_slug: slug ?? '',
      source: 'cloud_save',
      cta_location: 'play_overlay',
      logged_in: false,
    });
    const returnTo = slug ? `/play/${slug}` : '/';
    if (gameId) markSignupIntent(gameId); // so we can offer to sync after signup
    navigate(withReturnTo('/register', returnTo));
  }, [gameId, slug, navigate]);

  const handleCtaLogin = useCallback(() => {
    trackEvent('login_cta_clicked', {
      game_id: gameId ?? '',
      game_slug: slug ?? '',
      source: 'cloud_save',
      cta_location: 'play_overlay',
      logged_in: false,
    });
    const returnTo = slug ? `/play/${slug}` : '/';
    if (gameId) markSignupIntent(gameId);
    navigate(withReturnTo('/login', returnTo));
  }, [gameId, slug, navigate]);

  const handleCtaContinueGuest = useCallback(() => {
    suppressCta();
    setCtaVisible(false);
  }, []);

  // Ask the game (over the SDK) for its local save, then decide sync vs conflict.
  const offerSyncIfNeeded = useCallback(async () => {
    if (IS_DEMO || !currentUser || !gameId) return;
    if (syncOfferedRef.current) return;
    const bridge = bridgeRef.current;
    if (!bridge) return;
    syncOfferedRef.current = true;
    const local = await bridge.requestLocalSave();
    if (!local || !canOfferCloudSaveSync(Boolean(currentUser), gameId, local.data)) {
      syncOfferedRef.current = false; // nothing provided; allow a later attempt
      return;
    }
    localSaveDataRef.current = { data: local.data, schemaVersion: local.schemaVersion };
    let hasCloud: boolean;
    try {
      hasCloud = (await api.getGameSave(gameId)) !== null;
    } catch {
      hasCloud = false;
    }
    setSyncPrompt({ hasCloud });
    trackEvent('cloud_save_sync_prompt_shown', {
      game_id: gameId,
      game_slug: slug ?? '',
      source: hasCloud ? 'save_conflict' : 'local_progress',
      logged_in: true,
    });
  }, [currentUser, gameId, slug]);

  // Upload this device's local save (sync mode, or "replace cloud" in conflict).
  const handleSyncUpload = useCallback(async () => {
    if (!gameId) return;
    const local = localSaveDataRef.current;
    if (!local) {
      setSyncPrompt(null);
      return;
    }
    setSyncBusy(true);
    trackEvent('cloud_save_sync_accepted', {
      game_id: gameId,
      game_slug: slug ?? '',
      source: syncPrompt?.hasCloud ? 'replace_cloud' : 'local_progress',
      logged_in: true,
    });
    try {
      await api.putGameSave(gameId, local.data, local.schemaVersion);
      toast.success(translateRef.current('cloudSave.syncedToast'));
      setSyncPrompt(null);
    } catch {
      toast.danger(translateRef.current('cloudSave.syncFailedToast'));
    } finally {
      setSyncBusy(false);
    }
  }, [gameId, slug, syncPrompt]);

  const handleSyncDismiss = useCallback(
    (source: 'keep_cloud' | 'keep_local') => {
      // "Keep cloud" and "Keep local only" both just dismiss — we never delete the
      // local save automatically; the game owns its local storage.
      trackEvent('cloud_save_sync_skipped', {
        game_id: gameId ?? '',
        game_slug: slug ?? '',
        source,
        logged_in: true,
      });
      setSyncPrompt(null);
    },
    [gameId, slug],
  );

  useEffect(() => {
    if (!isLoading && !game) {
      toast.danger(t('player.loadError'));
      navigate('/games');
    }
  }, [game, isLoading, navigate, t]);

  useEffect(() => {
    if (IS_DEMO || !gameId) return;
    let active = true;
    let sessionId: string | undefined;

    queueMicrotask(() => {
      if (active) setLaunch(null);
    });
    void api
      .launchGame(gameId)
      .then((descriptor) => {
        // The launch URL must be a unique per-version subdomain of the
        // configured game host base — never the shared base origin itself.
        if (!isAllowedGameLaunchUrl(descriptor.gameUrl, GAME_ORIGIN)) {
          throw new Error(translateRef.current('player.originError'));
        }
        sessionId = descriptor.sessionId;
        if (!active) {
          void api.endPlaySession(sessionId);
          return;
        }
        setLaunch(descriptor);
        setIsPlaying(true);
        trackEvent('play_started', {
          game_id: gameId,
          game_slug: slug ?? '',
          source: 'play_page',
          logged_in: Boolean(currentUser),
        });
      })
      .catch((error) => {
        if (!active) return;
        toast.danger(
          error instanceof Error ? error.message : translateRef.current('player.launchError'),
        );
      });

    return () => {
      active = false;
      if (sessionId) void api.endPlaySession(sessionId);
    };
  }, [currentUser, gameId, slug]);

  useEffect(() => {
    if (IS_DEMO || !launch || !iframeRef.current) return;

    // Authenticated save backend — provided ONLY when logged in. The bridge never
    // sees tokens/cookies; this adapter performs the same-origin authed calls.
    const saveAdapter: HostSaveAdapter | null =
      currentUser && gameId
        ? createCloudSaveAdapter(api, gameId, {
            onAuthRequired: () => requestCta('auth_required'),
          })
        : null;

    const bridge = new GameBridge({
      iframe: iframeRef.current,
      gameOrigin: new URL(launch.gameUrl).origin,
      playerSummary: currentUser
        ? {
            id: currentUser.id,
            username: currentUser.username,
            displayName: currentUser.displayName,
            avatarUrl: currentUser.avatar || null,
          }
        : null,
      saveAdapter,
      events: {
        onReady: () => setSdkReady(true),
        onProgress: () => requestCta('progress'),
        onGuestSaveAttempt: () => {
          requestCta('guest_save');
        },
        onLocalSaveAvailable: (meta: LocalSaveAvailablePayload) => {
          if (meta.has) void offerSyncIfNeeded();
        },
        onFullscreenRequest: async () => {
          const container = containerRef.current;
          if (!container) return false;
          if (container.requestFullscreen) {
            await container.requestFullscreen();
            return true;
          }
          await (container as WebkitFullscreenElement).webkitRequestFullscreen?.();
          return true;
        },
        onGameError: (message) =>
          toast.danger(translateRef.current('player.gameError', { message })),
      },
    });
    bridgeRef.current = bridge;
    return () => {
      bridgeRef.current = null;
      bridge.destroy();
    };
  }, [currentUser, iframeKey, launch, gameId, requestCta, offerSyncIfNeeded]);

  // Soft CTA after a few minutes of guest play (complements progress/guest-save).
  useEffect(() => {
    if (IS_DEMO || currentUser || !launch) return;
    const timer = setTimeout(() => requestCta('time'), CTA_PLAY_THRESHOLD_MS);
    return () => clearTimeout(timer);
  }, [currentUser, launch, requestCta]);

  // Record the conversion when a player returns to this game after signing up.
  useEffect(() => {
    if (IS_DEMO || !currentUser || !gameId) return;
    if (consumeSignupIntent(gameId)) {
      void offerSyncIfNeeded();
    }
  }, [currentUser, gameId, offerSyncIfNeeded]);

  // Loading simulation
  useEffect(() => {
    if (!IS_DEMO || !game) return;

    let timer: ReturnType<typeof setTimeout>;
    if (loadingStep < LOADING_TEXTS.length - 1) {
      timer = setTimeout(() => {
        setLoadingStep((prev) => prev + 1);
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
  }, [addRecentlyPlayed, currentUser, game, loadingStep]);

  // Synthwave Canvas game simulation loop
  useEffect(() => {
    if (!IS_DEMO || loading || !isPlaying || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = (canvas.width = 800);
    const height = (canvas.height = 450);

    let time = 0;
    const stars: { x: number; y: number; size: number; speed: number }[] = [];

    // Initialize stars
    for (let i = 0; i < 60; i++) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * (height / 2),
        size: Math.random() * 2,
        speed: Math.random() * 0.2 + 0.05,
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
      stars.forEach((s) => {
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
        const py = horizon + Math.pow(i / gridRows, 2) * (height - horizon);

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
      const playerGradient = ctx.createLinearGradient(
        playerX - 25,
        playerY,
        playerX + 25,
        playerY + 30,
      );
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

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    try {
      if (!isFullscreen) {
        if (container.requestFullscreen) {
          await container.requestFullscreen();
        } else {
          await (container as WebkitFullscreenElement).webkitRequestFullscreen?.();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else {
          await (document as WebkitFullscreenDocument).webkitExitFullscreen?.();
        }
      }
    } catch {
      toast.warning(t('player.fullscreenError'));
    }
  };

  // Listen to escape key exit fullscreen
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(
        !!document.fullscreenElement ||
          !!(document as WebkitFullscreenDocument).webkitFullscreenElement,
      );
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  const handleRestart = () => {
    if (!IS_DEMO) {
      setIframeKey((key) => key + 1);
      toast.info(t('player.reloading'));
      return;
    }
    setLoading(true);
    setLoadingStep(0);
    setIsPlaying(false);
    toast.info(t('player.restartingDemo'));
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
    <div className="game-player-page">
      {/* Sandbox Warning header */}
      <div className="game-player-notice">
        <div className="game-player-notice__message">
          <AlertCircle size={16} color="var(--warning)" />
          <span>{t(IS_DEMO ? 'player.demoNotice' : 'player.sandboxNotice')}</span>
        </div>
        <div className="game-player-notice__actions">
          <LanguageSwitcher compact />
          <div className="game-player-sandbox-badge">
            <ShieldCheck size={14} color="var(--success)" />
            <span style={{ color: 'var(--success)' }} data-testid="sandbox-status">
              {IS_DEMO
                ? t('player.demoActive')
                : sdkReady
                  ? t('player.sdkConnected')
                  : t('player.sandboxActive')}
            </span>
          </div>
        </div>
      </div>

      {/* Main Play Area */}
      <div ref={containerRef} className="game-theater" data-fullscreen={isFullscreen}>
        {/* Top Control Bar */}
        <div className="game-theater__controls">
          <button onClick={handleExit} className="game-control-button game-control-button--exit">
            <ArrowLeft size={16} />
            <span>{t('player.exit')}</span>
          </button>

          <div className="game-theater__title">
            <strong>{game.title}</strong>
            <span>{t('common.by', { creator: game.creatorName })}</span>
          </div>

          <div className="game-theater__actions">
            <button
              onClick={handleRestart}
              className="game-control-button"
              title={t('player.restartTitle')}
            >
              <RotateCcw size={16} />
              <span className="game-control-button__label">{t('player.restart')}</span>
            </button>
            {IS_DEMO && (
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="game-control-button game-control-button--icon"
                title={t(isMuted ? 'player.unmute' : 'player.mute')}
              >
                {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
            )}
            <button
              onClick={() => void toggleFullscreen()}
              className="game-control-button"
              title={t(isFullscreen ? 'player.exitFullscreen' : 'player.enterFullscreen')}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              <span className="game-control-button__label">
                {t(isFullscreen ? 'player.exitFullscreen' : 'player.fullscreen')}
              </span>
            </button>
          </div>
        </div>

        {/* Display Wrapper */}
        <div className="game-theater__viewport">
          {/* Loading Layer */}
          {launchLoading && (
            <div className="game-theater__loading">
              <div className="game-theater__spinner"></div>
              <h2>{t('player.launching')}</h2>
              <p>{IS_DEMO ? LOADING_TEXTS[loadingStep] : t('player.authorizing')}</p>
              <div className="game-theater__progress">
                <div
                  className="game-theater__progress-value"
                  style={{
                    width: IS_DEMO ? `${((loadingStep + 1) / LOADING_TEXTS.length) * 100}%` : '35%',
                  }}
                ></div>
              </div>
            </div>
          )}

          {!IS_DEMO && launch && (
            <iframe
              key={iframeKey}
              ref={iframeRef}
              src={launch.gameUrl}
              title={game.title}
              sandbox="allow-scripts allow-same-origin allow-pointer-lock"
              allow="fullscreen"
              allowFullScreen
              referrerPolicy="no-referrer"
              className="game-theater__frame"
            />
          )}

          {IS_DEMO && !loading && isPlaying && (
            <canvas ref={canvasRef} className="game-theater__frame game-theater__canvas"></canvas>
          )}

          {/* Soft conversion CTA — guests only, dismissible, never blocks play. */}
          {!IS_DEMO && ctaVisible && (
            <CloudSaveCTA
              isGuest={isGuest}
              onCreateAccount={handleCtaCreateAccount}
              onLogin={handleCtaLogin}
              onContinueGuest={handleCtaContinueGuest}
            />
          )}

          {/* Guest-save transfer prompt after login/registration (Phase 4). */}
          {!IS_DEMO && syncPrompt && (
            <CloudSaveSyncPrompt
              gameTitle={game.title}
              hasCloud={syncPrompt.hasCloud}
              busy={syncBusy}
              onSync={handleSyncUpload}
              onKeepCloud={() => handleSyncDismiss('keep_cloud')}
              onKeepLocal={() => handleSyncDismiss('keep_local')}
            />
          )}
        </div>
      </div>

      {/* Site copy: "Play as guest. Save with account." (guests, real build). */}
      {!IS_DEMO && isGuest && (
        <p
          className="cloud-save-tagline"
          style={{ justifyContent: 'center', padding: '0.6rem 1rem' }}
        >
          <Cloud size={14} aria-hidden="true" />
          <span>
            <strong>{t('cloudSave.available')}</strong>
          </span>
        </p>
      )}
    </div>
  );
};
