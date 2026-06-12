import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGames } from '../../hooks/useGames';
import { useAuth } from '../../hooks/useAuth';
import { toast } from '../../components/toastEvents';
import { Save, ArrowLeft, AlertTriangle } from 'lucide-react';

export const EditGame: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { games, updateGame } = useGames();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

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
  const [deviceDesktop] = useState(() => game?.devices.includes('desktop') ?? true);
  const [deviceMobile] = useState(() => game?.devices.includes('mobile') ?? false);
  const [deviceTablet] = useState(() => game?.devices.includes('tablet') ?? false);
  const [multiplayer] = useState(() => game?.multiplayer ?? false);
  const [aiDisclosure] = useState<'no' | 'assisted' | 'generated'>(
    () => game?.aiDisclosure ?? 'no',
  );
  const [aiTools] = useState<string[]>(() => game?.aiTools ?? []);
  const [version, setVersion] = useState(() => game?.version ?? '1.0.0');
  const [changelogNotes, setChangelogNotes] = useState('');

  useEffect(() => {
    if (!game) {
      toast.danger('Game build not found.');
      navigate('/creator/my-games');
      return;
    }
  }, [game, navigate]);

  if (!game) return null;

  // Verify ownership
  if (currentUser?.id !== game.creatorId && currentUser?.role !== 'admin') {
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

    const devices = [];
    if (deviceDesktop) devices.push('desktop', 'keyboard', 'mouse');
    if (deviceMobile) devices.push('mobile', 'touch');
    if (deviceTablet) devices.push('tablet', 'touch');

    // Add changelog if notes are provided
    const changelog = [...game.changelog];
    if (changelogNotes.trim()) {
      changelog.unshift({
        version: version || game.version,
        date: new Date().toISOString().split('T')[0],
        notes: changelogNotes.trim(),
      });
    }

    // Update Game status - if published, major edit will push back to 'pending review' moderation
    let status = game.status;
    let statusMsg = 'Game details updated successfully!';

    if (game.status === 'published' && title !== game.title) {
      status = 'pending';
      statusMsg = 'Details updated! Title changes flag the build for repeat moderation.';
    }

    updateGame(game.id, {
      title,
      category,
      shortDescription: shortDesc,
      fullDescription: fullDesc,
      tags,
      coverUrl,
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
          Notice: Significant edits (such as changing the title or swapping files) will flag this
          build for repeat moderation. The game status will return to Pending Review.
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
              'Horror',
              'Simulator',
              'Racing',
              'Puzzle',
              'Multiplayer',
              'Experimental',
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

        <div className="form-group">
          <label className="form-label">Cover Image URL</label>
          <input
            type="text"
            value={coverUrl}
            onChange={(e) => setCoverUrl(e.target.value)}
            className="form-input"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Screenshot URL</label>
          <input
            type="text"
            value={screenshotUrl}
            onChange={(e) => setScreenshotUrl(e.target.value)}
            className="form-input"
          />
        </div>

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

        {/* Action Controls */}
        <div style={footerRowStyle}>
          <button type="submit" className="btn btn-primary" style={{ gap: '6px' }}>
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

const footerRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '12px',
  marginTop: '1.5rem',
  paddingTop: '1.5rem',
  borderTop: '1px solid var(--border-color)',
};
