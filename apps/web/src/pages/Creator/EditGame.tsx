import React, { useRef, useState, useEffect } from 'react';
import { SUPPORTED_DEVICES, type SupportedDevice } from '@vibeplay/shared';
import { useParams, useNavigate } from 'react-router-dom';
import { useGames } from '../../hooks/useGames';
import { useAuth } from '../../hooks/useAuth';
import { toast } from '../../components/toastEvents';
import {
  Save,
  ArrowLeft,
  AlertTriangle,
  UploadCloud,
  Trash2,
  Monitor,
  Smartphone,
  Tablet,
  Gamepad2,
} from 'lucide-react';
import { IS_DEMO } from '../../lib/appMode';
import { GameVersionManager } from '../../components/GameVersionManager';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/api/errors';
import { useI18n } from '../../i18n/useI18n';

const COVER_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
const COVER_MAX_BYTES = 5 * 1024 * 1024;

const DEVICE_ICONS = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
  gamepad: Gamepad2,
} as const;

export const EditGame: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { games, isLoading, updateGame, refreshGames } = useGames();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();

  // Find game
  const game = games.find((g) => g.id === id);

  // Form states
  const [title, setTitle] = useState(() => game?.title ?? '');
  const [category, setCategory] = useState(() => game?.category ?? 'Action');
  const [shortDesc, setShortDesc] = useState(() => game?.shortDescription ?? '');
  const [fullDesc, setFullDesc] = useState(() => game?.fullDescription ?? '');
  const [tagsInput, setTagsInput] = useState(() => game?.tags.join(', ') ?? '');
  const [coverUrl, setCoverUrl] = useState(() => game?.coverUrl ?? '');
  const [screenshotUrl, setScreenshotUrl] = useState(() => game?.screenshots[0] ?? '');
  const [devices, setDevices] = useState<SupportedDevice[]>(() => {
    const existing = (game?.devices ?? []).filter((device): device is SupportedDevice =>
      SUPPORTED_DEVICES.includes(device as SupportedDevice),
    );
    return existing.length > 0 ? existing : ['desktop'];
  });
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverProgress, setCoverProgress] = useState(0);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [multiplayer] = useState(() => game?.multiplayer ?? false);
  const [aiDisclosure] = useState<'no' | 'assisted' | 'generated'>(
    () => game?.aiDisclosure ?? 'no',
  );
  const [aiTools] = useState<string[]>(() => game?.aiTools ?? []);
  const [version, setVersion] = useState(() => game?.version ?? '1.0.0');
  const [changelogNotes, setChangelogNotes] = useState('');

  useEffect(() => {
    if (!isLoading && !game) {
      toast.danger('Game build not found.');
      navigate('/creator/my-games');
      return;
    }
  }, [game, isLoading, navigate]);

  if (isLoading || !game) return null;

  // Verify ownership
  if (
    currentUser?.id !== game.creatorId &&
    currentUser?.role !== 'admin' &&
    currentUser?.role !== 'owner'
  ) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <h2>Unauthorized</h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          You do not have permission to edit this game.
        </p>
        <button
          onClick={() => navigate('/creator/my-games')}
          className="btn btn-secondary"
          style={{ marginTop: '1rem' }}
        >
          Back to My Games
        </button>
      </div>
    );
  }

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const tags = tagsInput
      ? tagsInput
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t.length > 0)
      : game.tags;

    if (devices.length === 0) {
      toast.danger(t('cover.devicesRequired'));
      return;
    }

    // Add changelog if notes are provided
    const changelog = [...game.changelog];
    if (changelogNotes.trim()) {
      changelog.unshift({
        version: version || game.version,
        date: new Date().toISOString().split('T')[0],
        notes: changelogNotes.trim(),
      });
    }

    let status = game.status;
    let statusMsg = 'Game details updated successfully!';

    if (IS_DEMO && game.status === 'published' && title !== game.title) {
      status = 'pending';
      statusMsg = 'Details updated! Title changes flag the build for repeat moderation.';
    }

    updateGame(game.id, {
      title,
      category,
      shortDescription: shortDesc,
      fullDescription: fullDesc,
      tags,
      ...(IS_DEMO ? { coverUrl } : {}),
      screenshots: [screenshotUrl, ...game.screenshots.slice(1)],
      devices,
      multiplayer,
      aiDisclosure,
      aiTools,
      version: version || game.version,
      changelog,
      status,
    });

    toast.success(statusMsg);
    navigate('/creator/my-games');
  };

  const toggleDevice = (device: SupportedDevice) => {
    setDevices((current) =>
      current.includes(device) ? current.filter((item) => item !== device) : [...current, device],
    );
  };

  const handleCoverFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !id) return;
    if (!COVER_TYPES.includes(file.type as (typeof COVER_TYPES)[number])) {
      toast.danger(t('cover.unsupportedType'));
      return;
    }
    if (file.size > COVER_MAX_BYTES) {
      toast.danger(t('cover.tooLarge'));
      return;
    }

    setCoverUploading(true);
    setCoverProgress(10);
    try {
      const intent = await api.gameCoverUploadIntent(id, {
        contentType: file.type as (typeof COVER_TYPES)[number],
        fileName: file.name,
        size: file.size,
      });
      setCoverProgress(35);
      await api.uploadGameCoverDirect(id, intent.objectKey, intent.token, file);
      setCoverProgress(75);
      const updated = await api.completeGameCover(id, intent.objectKey);
      setCoverProgress(100);
      setCoverUrl(updated.coverUrl ?? '');
      await refreshGames();
      toast.success(t('cover.success'));
    } catch (error) {
      toast.danger(errorMessage(error));
    } finally {
      setCoverUploading(false);
      setCoverProgress(0);
    }
  };

  const handleCoverRemove = async () => {
    if (!id) return;
    setCoverUploading(true);
    try {
      await api.removeGameCover(id);
      setCoverUrl('');
      await refreshGames();
      toast.success(t('cover.removed'));
    } catch (error) {
      toast.danger(errorMessage(error));
    } finally {
      setCoverUploading(false);
    }
  };

  return (
    <div style={wrapperStyle} className="animate-fade">
      {/* Back button header */}
      <div style={headerStyle}>
        <button onClick={() => navigate('/creator/my-games')} style={backLinkStyle}>
          <ArrowLeft size={16} />
          <span>My Games</span>
        </button>
        <h1>Edit: {game.title}</h1>
      </div>

      {/* Warnings banner */}
      <div style={noticeBoxStyle}>
        <AlertTriangle size={20} color="var(--warning)" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
          {IS_DEMO
            ? 'In demo mode, title changes move the game back to Pending Review.'
            : 'This form updates catalog metadata only. Uploading a new executable version requires a new ZIP validation and moderation cycle.'}
        </span>
      </div>

      {/* Form Card */}
      <form onSubmit={handleFormSubmit} style={formCardStyle} className="bg-glass">
        <div className="form-group">
          <label className="form-label">Game Title</label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="form-input"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="form-input form-select"
          >
            {[
              'Action',
              'Adventure',
              'Arcade',
              'Casual',
              'Platformer',
              'RPG',
              'Shooter',
              'Simulator',
              'Racing',
              'Puzzle',
              'Sports',
              'Strategy',
            ].map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Short Description</label>
          <input
            type="text"
            required
            maxLength={120}
            value={shortDesc}
            onChange={(e) => setShortDesc(e.target.value)}
            className="form-input"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Full Description</label>
          <textarea
            required
            value={fullDesc}
            onChange={(e) => setFullDesc(e.target.value)}
            className="form-input"
            style={{ minHeight: '120px', resize: 'vertical' }}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Tags (separated by comma)</label>
          <input
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            className="form-input"
          />
        </div>

        {IS_DEMO ? (
          <div className="form-group">
            <label className="form-label" htmlFor="cover-url">
              {t('cover.urlLabel')}
            </label>
            <input
              id="cover-url"
              type="url"
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              className="form-input"
            />
          </div>
        ) : (
          <div className="form-group">
            <span className="form-label">{t('cover.title')}</span>
            <div style={coverPreviewStyle}>
              {coverUrl ? (
                <img src={coverUrl} alt={t('cover.previewAlt')} style={coverImageStyle} />
              ) : (
                <div style={coverFallbackStyle}>
                  <Gamepad2 size={36} aria-hidden="true" />
                  <span>{t('cover.noCover')}</span>
                </div>
              )}
            </div>
            <div style={coverActionsStyle}>
              <label
                className="btn btn-secondary"
                style={{ cursor: coverUploading ? 'wait' : 'pointer', gap: '6px' }}
              >
                <UploadCloud size={16} aria-hidden="true" />
                {coverUploading ? t('cover.uploading') : t('cover.chooseFile')}
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                  onChange={(event) => void handleCoverFile(event)}
                  disabled={coverUploading}
                  aria-label={t('cover.chooseFile')}
                  style={{ display: 'none' }}
                />
              </label>
              {coverUrl && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={coverUploading}
                  onClick={() => void handleCoverRemove()}
                >
                  <Trash2 size={15} aria-hidden="true" />
                  {t('cover.remove')}
                </button>
              )}
            </div>
            {coverProgress > 0 && (
              <div
                role="progressbar"
                aria-label={t('cover.progress')}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={coverProgress}
                style={progressTrackStyle}
              >
                <div style={{ ...progressBarStyle, width: `${coverProgress}%` }} />
              </div>
            )}
            <span style={helperStyle}>{t('cover.helper')}</span>
          </div>
        )}

        <fieldset style={deviceFieldsetStyle}>
          <legend className="form-label">{t('cover.devicesTitle')}</legend>
          <div style={deviceGridStyle}>
            {SUPPORTED_DEVICES.map((device) => {
              const Icon = DEVICE_ICONS[device];
              return (
                <label key={device} style={deviceOptionStyle}>
                  <input
                    type="checkbox"
                    checked={devices.includes(device)}
                    onChange={() => toggleDevice(device)}
                  />
                  <Icon size={17} aria-hidden="true" />
                  <span>{t(`device.${device}`)}</span>
                </label>
              );
            })}
          </div>
          <span style={helperStyle}>{t('cover.devicesHelper')}</span>
        </fieldset>

        <div className="form-group">
          <label className="form-label">Screenshot URL</label>
          <input
            type="text"
            value={screenshotUrl}
            onChange={(e) => setScreenshotUrl(e.target.value)}
            className="form-input"
          />
        </div>

        {IS_DEMO ? (
          <>
            <div className="form-group">
              <label className="form-label">Version Code</label>
              <input
                type="text"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                className="form-input"
                placeholder="e.g. 1.1.0"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Changelog Updates Notes</label>
              <textarea
                value={changelogNotes}
                onChange={(e) => setChangelogNotes(e.target.value)}
                className="form-input"
                placeholder="Describe what has changed in this version..."
                style={{ minHeight: '80px', resize: 'vertical' }}
              />
              <span style={helperStyle}>Leave empty if version code is not changing.</span>
            </div>
          </>
        ) : (
          <div className="form-group">
            <label className="form-label">Published Version</label>
            <input type="text" value={game.version} className="form-input" disabled />
          </div>
        )}

        {/* Action Controls */}
        <div style={footerRowStyle}>
          <button
            type="submit"
            disabled={coverUploading}
            className="btn btn-primary"
            style={{ gap: '6px' }}
          >
            <Save size={16} />
            <span>Save Changes</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/creator/my-games')}
            className="btn btn-secondary"
          >
            Cancel
          </button>
        </div>
      </form>

      {/* Game files update / new version flow (real mode). The published version
          stays live until a new version is validated, scanned, and approved. */}
      {!IS_DEMO && id && <GameVersionManager gameId={id} />}
    </div>
  );
};

// Styles
const wrapperStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1.5rem',
  maxWidth: '700px',
  width: '100%',
  margin: '0 auto',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

const backLinkStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary)',
  fontSize: '0.85rem',
  fontWeight: 600,
  cursor: 'pointer',
  padding: 0,
};

const noticeBoxStyle: React.CSSProperties = {
  display: 'flex',
  gap: '12px',
  alignItems: 'center',
  padding: '12px 18px',
  borderRadius: '8px',
  border: '1px solid var(--primary-border)',
  backgroundColor: 'var(--warning-soft)',
};

const formCardStyle: React.CSSProperties = {
  borderRadius: '16px',
  border: '1px solid var(--border-color)',
  padding: '2.5rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '1.25rem',
};

const helperStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.75rem',
  color: 'var(--text-secondary)',
  marginTop: '4px',
};

const coverPreviewStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  aspectRatio: '16 / 9',
  overflow: 'hidden',
  borderRadius: '10px',
  border: '1px solid var(--border-color)',
  backgroundColor: 'var(--surface-2)',
};

const coverImageStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
};

const coverFallbackStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.5rem',
  color: 'var(--text-muted)',
  background: 'linear-gradient(135deg, var(--surface-3), var(--surface-1))',
};

const coverActionsStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.5rem',
  marginTop: '0.75rem',
};

const progressTrackStyle: React.CSSProperties = {
  height: '6px',
  marginTop: '0.75rem',
  borderRadius: '999px',
  overflow: 'hidden',
  backgroundColor: 'var(--surface-3)',
};

const progressBarStyle: React.CSSProperties = {
  height: '100%',
  borderRadius: 'inherit',
  backgroundColor: 'var(--primary)',
  transition: 'width 180ms ease',
};

const deviceFieldsetStyle: React.CSSProperties = {
  border: 0,
  padding: 0,
  margin: 0,
};

const deviceGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
  gap: '0.75rem',
};

const deviceOptionStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  minHeight: '44px',
  padding: '0.65rem 0.75rem',
  border: '1px solid var(--border-color)',
  borderRadius: '8px',
  cursor: 'pointer',
};

const footerRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '12px',
  marginTop: '1.5rem',
  paddingTop: '1.5rem',
  borderTop: '1px solid var(--border-color)',
};
