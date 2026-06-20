import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useGames } from '../../hooks/useGames';
import type { Game } from '../../types';
import { toast } from '../../components/toastEvents';
import { useI18n } from '../../i18n/useI18n';
import { Check, X, Cpu, Eye } from 'lucide-react';
import { api } from '../../lib/api';
import { IS_DEMO } from '../../lib/appMode';

export const AdminModeration: React.FC = () => {
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const { games, approveGame, rejectGame } = useGames();
  const [searchParams, setSearchParams] = useSearchParams();

  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReasonText, setRejectReasonText] = useState('');

  // The moderation queue = games that have a version awaiting review. The API
  // returns READY_FOR_REVIEW / VALIDATING / SCAN_FAILED versions regardless of the
  // parent game's status, so a DRAFT game with a READY_FOR_REVIEW build still shows
  // up here. We key off the moderation version id (not the game status) to honour
  // that — requiring Game.status === 'pending' would hide DRAFT-game builds.
  const pendingGames = games
    .filter((g) => Boolean(g.moderationVersionId))
    .sort((a, b) => Number(Boolean(b.priorityModeration)) - Number(Boolean(a.priorityModeration)));

  const selectedGame =
    pendingGames.find((game) => game.id === searchParams.get('game')) ?? pendingGames[0] ?? null;

  const handleSelectGame = (game: Game) => {
    setSearchParams({ game: game.id });
  };

  const handleApprove = () => {
    if (!selectedGame || !currentUser) return;

    if (window.confirm(t('admin.approveConfirm', { title: selectedGame.title }))) {
      approveGame(selectedGame.id, currentUser.id, currentUser.displayName);
      toast.success(t('admin.approvedToast', { title: selectedGame.title }));
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
      toast.warning(t('admin.rejectReasonRequired'));
      return;
    }

    rejectGame(selectedGame.id, rejectReasonText.trim(), currentUser.id, currentUser.displayName);
    toast.danger(t('admin.rejectedToast', { title: selectedGame.title }));
    setShowRejectModal(false);
    setSearchParams({});
  };

  const handlePreview = () => {
    if (!selectedGame) return;
    if (IS_DEMO) {
      window.open(`/game/${selectedGame.slug}`, '_blank', 'noopener,noreferrer');
      return;
    }
    if (!selectedGame.moderationVersionId) {
      toast.danger(t('admin.moderationUnavailable'));
      return;
    }
    void api
      .adminPreviewUrl(selectedGame.moderationVersionId)
      .then((url) => window.open(url, '_blank', 'noopener,noreferrer'))
      .catch((error) =>
        toast.danger(error instanceof Error ? error.message : t('admin.previewUrlError')),
      );
  };

  return (
    <div style={containerStyle} className="animate-fade">
      {/* Reject Modal */}
      {showRejectModal && selectedGame && (
        <div style={modalOverlayStyle}>
          <div style={modalStyle} className="bg-glass animate-slide-up">
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              {t('admin.rejectSubmission')}
            </h3>
            <p
              style={{
                fontSize: '0.85rem',
                color: 'var(--text-secondary)',
                marginBottom: '1.25rem',
              }}
            >
              {t('admin.rejectInstructions', { title: selectedGame.title })}
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
                {t('common.cancel')}
              </button>
              <button onClick={handleConfirmReject} className="btn btn-danger btn-sm">
                {t('admin.confirmRejection')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid split */}
      <div style={layoutGridStyle}>
        {/* Left Side: Pending List */}
        <div style={listColStyle}>
          <h2 style={titleStyle}>{t('admin.moderationQueue', { count: pendingGames.length })}</h2>

          <div style={listContainerStyle}>
            {pendingGames.length === 0 ? (
              <div style={emptyQueueStyle}>
                <Check size={36} color="var(--success)" style={{ marginBottom: '0.5rem' }} />
                <h3>{t('admin.queueEmpty')}</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {t('admin.allModerated')}
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
                      {t('common.by', { creator: g.creatorName })}
                    </div>
                  </div>
                  <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>
                    {t('admin.pending')}
                  </span>
                  {g.priorityModeration && (
                    <span className="creator-plus-badge">{t('billing.priority')}</span>
                  )}
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
                    {t('admin.uploadedBy', {
                      creator: selectedGame.creatorName,
                      category: selectedGame.category,
                    })}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={handleApprove}
                    className="btn btn-success btn-sm"
                    style={{ gap: '4px' }}
                  >
                    <Check size={14} /> {t('admin.approve')}
                  </button>
                  <button
                    onClick={handleRejectClick}
                    className="btn btn-danger btn-sm"
                    style={{ gap: '4px' }}
                  >
                    <X size={14} /> {t('admin.reject')}
                  </button>
                </div>
              </div>

              <hr style={hrStyle} />

              {/* Worker validation report */}
              <div style={scansSectionStyle}>
                <h4 style={sectionHeadingStyle}>{t('admin.workerReport')}</h4>
                <div style={logsBoxStyle}>
                  {selectedGame.validationReport ? (
                    <>
                      {selectedGame.validationReport.checks.map((check) => (
                        <div key={check.name} style={logLineStyle}>
                          <span style={{ color: check.ok ? 'var(--success)' : 'var(--danger)' }}>
                            [{check.ok ? 'PASS' : 'FAIL'}]
                          </span>{' '}
                          {check.name}
                          {check.detail ? `: ${check.detail}` : ''}
                        </div>
                      ))}
                      <div style={{ ...logLineStyle, marginTop: '6px', fontWeight: 600 }}>
                        Malware scanner: {selectedGame.validationReport.scanner.engine} /{' '}
                        {selectedGame.validationReport.scanner.result}
                      </div>
                    </>
                  ) : (
                    <div style={logLineStyle}>
                      {IS_DEMO ? t('admin.noValidationReportDemo') : t('admin.noValidationReport')}
                    </div>
                  )}
                </div>
              </div>

              {/* Basic metadata */}
              <div style={infoGridStyle}>
                <div style={metaCardStyle}>
                  <strong>{t('admin.archiveDetails')}</strong>
                  <div
                    style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}
                  >
                    <div>
                      {t('admin.zipName', { name: selectedGame.fileName || t('admin.noneListed') })}
                    </div>
                    <div>
                      {t('admin.zipSize', { size: selectedGame.fileSize || t('admin.noneListed') })}
                    </div>
                    <div>{t('admin.buildVersion', { version: selectedGame.version })}</div>
                  </div>
                </div>

                <div style={metaCardStyle}>
                  <strong>{t('admin.aiDisclosureTitle')}</strong>
                  <div
                    style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}
                  >
                    <div>
                      {t('admin.aiDisclosureType', {
                        type: selectedGame.aiDisclosure.toUpperCase(),
                      })}
                    </div>
                    <div>
                      {t('admin.aiToolsList', {
                        tools:
                          selectedGame.aiTools.length > 0
                            ? selectedGame.aiTools.join(', ')
                            : t('admin.noneListed'),
                      })}
                    </div>
                  </div>
                </div>

                <div style={metaCardStyle}>
                  <strong>{t('admin.compatibilities')}</strong>
                  <div
                    style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}
                  >
                    <div>{t('admin.inputs', { inputs: selectedGame.devices.join(', ') })}</div>
                    <div>
                      {t('admin.multiplayerText', {
                        multiplayer: selectedGame.multiplayer ? t('admin.yes') : t('admin.no'),
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Descriptions */}
              <div>
                <strong>{t('admin.shortDescTitle')}</strong>
                <p style={descTextStyle}>{selectedGame.shortDescription}</p>
              </div>

              <div>
                <strong>{t('admin.fullDescTitle')}</strong>
                <p style={descTextStyle}>{selectedGame.fullDescription}</p>
              </div>

              {/* Actions Preview link */}
              <div style={{ marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={handlePreview}
                  className="btn btn-secondary btn-sm"
                  style={{ gap: '6px' }}
                >
                  <Eye size={14} />
                  <span>{IS_DEMO ? t('admin.openDemoDetail') : t('admin.launchPreview')}</span>
                </button>
              </div>
            </div>
          ) : (
            <div style={emptyDetailStyle} className="bg-glass">
              <Cpu size={32} style={{ opacity: 0.15, marginBottom: '6px' }} />
              <span>{t('admin.selectBuildPrompt')}</span>
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
  zIndex: 'var(--z-modal)',
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
