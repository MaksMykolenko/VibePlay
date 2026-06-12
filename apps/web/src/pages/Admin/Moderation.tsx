import React, { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useGames } from '../../hooks/useGames';
import type { Game } from '../../types';
import { toast } from '../../components/toastEvents';
import { Check, X, Cpu, Eye } from 'lucide-react';

export const AdminModeration: React.FC = () => {
  const { currentUser } = useAuth();
  const { games, approveGame, rejectGame } = useGames();
  const [searchParams, setSearchParams] = useSearchParams();

  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReasonText, setRejectReasonText] = useState('');

  // Moderation queue: Status is pending
  const pendingGames = games.filter((g) => g.status === 'pending');

  const selectedGame =
    pendingGames.find((game) => game.id === searchParams.get('game')) ?? pendingGames[0] ?? null;

  const handleSelectGame = (game: Game) => {
    setSearchParams({ game: game.id });
  };

  const handleApprove = () => {
    if (!selectedGame || !currentUser) return;

    if (
      window.confirm(`Approve "${selectedGame.title}" and publish it to the live VibePlay catalog?`)
    ) {
      approveGame(selectedGame.id, currentUser.id, currentUser.displayName);
      toast.success(`"${selectedGame.title}" approved and published!`);
      setSearchParams({});
    }
  };

  const handleRejectClick = () => {
    setRejectReasonText('');
    setShowRejectModal(true);
  };

  const handleConfirmReject = () => {
    if (!selectedGame || !currentUser) return;
    if (!rejectReasonText.trim()) {
      toast.warning('Please provide a reason for rejection.');
      return;
    }

    rejectGame(selectedGame.id, rejectReasonText.trim(), currentUser.id, currentUser.displayName);
    toast.danger(`Build "${selectedGame.title}" was rejected.`);
    setShowRejectModal(false);
    setSearchParams({});
  };

  return (
    <div style={containerStyle} className="animate-fade">
      {/* Reject Modal */}
      {showRejectModal && selectedGame && (
        <div style={modalOverlayStyle}>
          <div style={modalStyle} className="bg-glass animate-slide-up">
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              Reject Submission
            </h3>
            <p
              style={{
                fontSize: '0.85rem',
                color: 'var(--text-secondary)',
                marginBottom: '1.25rem',
              }}
            >
              Specify why the build <strong>{selectedGame.title}</strong> is being rejected. The
              creator will see this note.
            </p>
            <textarea
              placeholder="e.g. Asset check failed: Missing textures. File index.html is empty. Contains malicious script triggers..."
              value={rejectReasonText}
              onChange={(e) => setRejectReasonText(e.target.value)}
              className="form-input"
              style={{ minHeight: '100px', resize: 'vertical', marginBottom: '1.5rem' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setShowRejectModal(false)}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button onClick={handleConfirmReject} className="btn btn-danger btn-sm">
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid split */}
      <div style={layoutGridStyle}>
        {/* Left Side: Pending List */}
        <div style={listColStyle}>
          <h2 style={titleStyle}>Moderation Queue ({pendingGames.length})</h2>

          <div style={listContainerStyle}>
            {pendingGames.length === 0 ? (
              <div style={emptyQueueStyle}>
                <Check size={36} color="var(--success)" style={{ marginBottom: '0.5rem' }} />
                <h3>Queue Empty</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  All uploaded browser builds have been moderated.
                </span>
              </div>
            ) : (
              pendingGames.map((g) => (
                <div
                  key={g.id}
                  onClick={() => handleSelectGame(g)}
                  style={{
                    ...queueCardStyle,
                    backgroundColor:
                      selectedGame?.id === g.id ? 'var(--bg-hover)' : 'var(--bg-card)',
                    borderColor:
                      selectedGame?.id === g.id ? 'var(--secondary)' : 'var(--border-color)',
                  }}
                >
                  <img src={g.coverUrl} alt="" style={coverStyle} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{g.title}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      by @{g.creatorName}
                    </div>
                  </div>
                  <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>
                    Pending
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Side: Selected Game Diagnostics */}
        <div style={detailColStyle}>
          {selectedGame ? (
            <div style={diagnosticsCardStyle} className="bg-glass">
              {/* Game Meta Header */}
              <div style={diagnosticsHeaderStyle}>
                <div>
                  <h3 style={{ fontSize: '1.4rem', fontWeight: 700 }}>{selectedGame.title}</h3>
                  <div
                    style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}
                  >
                    Uploaded by <strong>@{selectedGame.creatorName}</strong> • Category:{' '}
                    <strong>{selectedGame.category}</strong>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={handleApprove}
                    className="btn btn-success btn-sm"
                    style={{ gap: '4px' }}
                  >
                    <Check size={14} /> Approve
                  </button>
                  <button
                    onClick={handleRejectClick}
                    className="btn btn-danger btn-sm"
                    style={{ gap: '4px' }}
                  >
                    <X size={14} /> Reject
                  </button>
                </div>
              </div>

              <hr style={hrStyle} />

              {/* Security Diagnostics scan logs */}
              <div style={scansSectionStyle}>
                <h4 style={sectionHeadingStyle}>Simulated Sandbox Scan Diagnostic</h4>
                <div style={logsBoxStyle}>
                  <div style={logLineStyle}>
                    <span style={{ color: 'var(--success)' }}>[PASS]</span> Sandbox Checksum
                    Verification: hash matches original bundle.
                  </div>
                  <div style={logLineStyle}>
                    <span style={{ color: 'var(--success)' }}>[PASS]</span> Entrypoint Validation:
                    index.html found at root level.
                  </div>
                  <div style={logLineStyle}>
                    <span style={{ color: 'var(--success)' }}>[PASS]</span> Static Malware Scan: 0
                    files flagged.
                  </div>
                  <div style={logLineStyle}>
                    <span style={{ color: 'var(--success)' }}>[PASS]</span> Server Call Prevention:
                    no active outbound API requests detected.
                  </div>
                  <div style={logLineStyle}>
                    <span style={{ color: 'var(--success)' }}>[PASS]</span> WebGL Context
                    initialization checks complete.
                  </div>
                  <div
                    style={{
                      ...logLineStyle,
                      fontWeight: 600,
                      color: 'var(--success)',
                      marginTop: '6px',
                    }}
                  >
                    &gt; DIAGNOSTICS CODE SCANNER STATUS: SECURE FOR IFRAME SANDBOX RUN
                  </div>
                </div>
              </div>

              {/* Basic metadata */}
              <div style={infoGridStyle}>
                <div style={metaCardStyle}>
                  <strong>Archive File details:</strong>
                  <div
                    style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}
                  >
                    <div>ZIP Name: {selectedGame.fileName || 'robo-arena-v1.zip'}</div>
                    <div>ZIP Size: {selectedGame.fileSize || '18.3 MB'}</div>
                    <div>Build Version: v{selectedGame.version}</div>
                  </div>
                </div>

                <div style={metaCardStyle}>
                  <strong>AI Disclosure:</strong>
                  <div
                    style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}
                  >
                    <div>Type: {selectedGame.aiDisclosure.toUpperCase()}</div>
                    <div>
                      Tools:{' '}
                      {selectedGame.aiTools.length > 0
                        ? selectedGame.aiTools.join(', ')
                        : 'None listed'}
                    </div>
                  </div>
                </div>

                <div style={metaCardStyle}>
                  <strong>Compatibilities:</strong>
                  <div
                    style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}
                  >
                    <div>Inputs: {selectedGame.devices.join(', ')}</div>
                    <div>Multiplayer: {selectedGame.multiplayer ? 'Yes' : 'No'}</div>
                  </div>
                </div>
              </div>

              {/* Descriptions */}
              <div>
                <strong>Short Hook Description:</strong>
                <p style={descTextStyle}>{selectedGame.shortDescription}</p>
              </div>

              <div>
                <strong>Full Description:</strong>
                <p style={descTextStyle}>{selectedGame.fullDescription}</p>
              </div>

              {/* Actions Preview link */}
              <div style={{ marginTop: '1rem' }}>
                <Link
                  to={`/game/${selectedGame.slug}`}
                  target="_blank"
                  className="btn btn-secondary btn-sm"
                  style={{ gap: '6px' }}
                >
                  <Eye size={14} />
                  <span>Launch Safe Preview Player</span>
                </Link>
              </div>
            </div>
          ) : (
            <div style={emptyDetailStyle} className="bg-glass">
              <Cpu size={32} style={{ opacity: 0.15, marginBottom: '6px' }} />
              <span>Select a game build from the left queue to audit diagnostics.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Styles
const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1.5rem',
  height: '100%',
};

const titleStyle: React.CSSProperties = {
  fontSize: '1.5rem',
  fontWeight: 700,
  fontFamily: 'var(--font-display)',
  letterSpacing: '-0.01em',
};

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(5, 7, 13, 0.85)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
  padding: '1.5rem',
};

const modalStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '460px',
  borderRadius: '16px',
  border: '1px solid var(--border-color)',
  padding: '2rem',
  boxShadow: 'var(--shadow-lg)',
  backgroundColor: 'var(--bg-card)',
};

const layoutGridStyle: React.CSSProperties = {
  display: 'flex',
  gap: '2rem',
  alignItems: 'flex-start',
  flexWrap: 'wrap',
  flex: 1,
};

const listColStyle: React.CSSProperties = {
  flex: '1 1 260px',
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
};

const listContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
};

const emptyQueueStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-card)',
  border: '1px dashed var(--border-color)',
  borderRadius: '12px',
  padding: '4rem 1.5rem',
  textAlign: 'center',
  color: 'var(--text-secondary)',
};

const queueCardStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '10px 14px',
  borderRadius: '8px',
  border: '1px solid var(--border-color)',
  cursor: 'pointer',
  transition: 'all 0.2s',
};

const coverStyle: React.CSSProperties = {
  width: '48px',
  height: '30px',
  objectFit: 'cover',
  borderRadius: '4px',
  backgroundColor: '#151928',
};

const detailColStyle: React.CSSProperties = {
  flex: '2.5 1 450px',
};

const diagnosticsCardStyle: React.CSSProperties = {
  borderRadius: '16px',
  border: '1px solid var(--border-color)',
  padding: '2rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '1.5rem',
};

const diagnosticsHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '1rem',
};

const hrStyle: React.CSSProperties = {
  border: 'none',
  borderTop: '1px solid var(--border-color)',
};

const scansSectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

const sectionHeadingStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
  letterSpacing: '0.05em',
};

const logsBoxStyle: React.CSSProperties = {
  backgroundColor: '#05070D',
  borderRadius: '8px',
  padding: '1rem',
  fontFamily: 'Courier, monospace',
  fontSize: '0.75rem',
  lineHeight: 1.6,
};

const logLineStyle: React.CSSProperties = {};

const infoGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  gap: '1rem',
};

const metaCardStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-surface)',
  border: '1px solid var(--border-color)',
  padding: '10px 14px',
  borderRadius: '8px',
  fontSize: '0.85rem',
};

const descTextStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  color: 'var(--text-secondary)',
  lineHeight: 1.5,
  marginTop: '4px',
};

const emptyDetailStyle: React.CSSProperties = {
  borderRadius: '16px',
  border: '1px dashed var(--border-color)',
  padding: '8rem 2rem',
  textAlign: 'center',
  color: 'var(--text-secondary)',
  fontSize: '0.95rem',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
};
