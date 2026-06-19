import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_UPLOAD_LIMITS, type GameVersionDto } from '@vibeplay/shared';
import { api, ApiClientError } from '../lib/api';
import type { CreatorGameSummary } from '../lib/api/types';
import { toast } from './toastEvents';
import { useAuth } from '../hooks/useAuth';
import { useI18n } from '../i18n/useI18n';
import { versionStatusLabel } from '../lib/versionStatus';
import { UploadCloud, FileCode, AlertTriangle, History, RefreshCw, ShieldCheck } from 'lucide-react';

interface Props {
  gameId: string;
}

/** A version is "in flight" while it moves through upload → validation → review. */
const ACTIVE_STATUSES: GameVersionDto['status'][] = [
  'UPLOADING',
  'QUARANTINED',
  'VALIDATING',
  'READY_FOR_REVIEW',
  'APPROVED',
];

/** Validation/review reached a terminal state — stop polling. */
const TERMINAL_STATUSES: GameVersionDto['status'][] = [
  'READY_FOR_REVIEW',
  'SCAN_FAILED',
  'REJECTED',
  'PUBLISHED',
  'ARCHIVED',
];

function bumpPatch(version: string | undefined): string {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version ?? '');
  if (!m) return '1.0.1';
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}

function statusBadgeColor(status: GameVersionDto['status']): string {
  switch (status) {
    case 'PUBLISHED':
      return 'var(--success)';
    case 'SCAN_FAILED':
    case 'REJECTED':
      return 'var(--danger)';
    case 'READY_FOR_REVIEW':
    case 'APPROVED':
      return 'var(--secondary)';
    case 'ARCHIVED':
      return 'var(--text-secondary)';
    default:
      return 'var(--warning)';
  }
}

function uploadErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === 'NETWORK_ERROR') return 'Upload endpoint is unreachable. Please try again.';
    if (error.status === 413) return 'Upload failed: the ZIP exceeds the size limit.';
    if (error.status === 401 || error.status === 403)
      return 'Upload failed: your session expired. Please sign in again and retry.';
    if (error.status === 409) return error.message || 'An update is already in progress.';
    return error.message || 'Upload failed. Please try again.';
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Upload failed. Please try again.';
}

export const GameVersionManager: React.FC<Props> = ({ gameId }) => {
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const isOwner = currentUser?.role === 'owner';

  const [summary, setSummary] = useState<CreatorGameSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Upload form state.
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [versionName, setVersionName] = useState('');
  const [changelog, setChangelog] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const draftRef = useRef<{ versionId?: string; uploadId?: string }>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Apply fetched data and default the version field to a patch bump over the
  // newest known version (only the first time, never clobbering user input).
  const applyData = useCallback((data: CreatorGameSummary) => {
    setSummary(data);
    setLoadError(null);
    setVersionName((prev) => prev || bumpPatch(data.versions[0]?.version));
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await api.getMyGame(gameId);
      applyData(data);
      return data;
    } catch (error) {
      setLoadError(uploadErrorMessage(error));
      return null;
    }
  }, [gameId, applyData]);

  useEffect(() => {
    let active = true;
    api
      .getMyGame(gameId)
      .then((data) => {
        if (active) applyData(data);
      })
      .catch((error) => {
        if (active) setLoadError(uploadErrorMessage(error));
      });
    return () => {
      active = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [gameId, applyData]);

  const versions = summary?.versions ?? [];
  const publishedId = summary?.game.publishedVersion?.id ?? null;
  const activeVersion = versions.find((v) => ACTIVE_STATUSES.includes(v.status));

  const pollStatus = useCallback(
    (uploadId: string) => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const status = await api.getUploadStatus(uploadId);
          setStatusLine(versionStatusLabel(status.versionStatus));
          if (TERMINAL_STATUSES.includes(status.versionStatus)) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            await load();
          }
        } catch {
          /* keep polling; transient errors are non-fatal */
        }
      }, 2500);
    },
    [load],
  );

  const handleZip = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.zip')) {
      toast.danger(t('publish.invalidZip'));
      return;
    }
    if (file.size > DEFAULT_UPLOAD_LIMITS.maxCompressedBytes) {
      toast.danger(t('publish.archiveTooLarge'));
      return;
    }
    setZipFile(file);
    draftRef.current = {}; // a new file means a fresh version/upload
  };

  const handleSubmit = async () => {
    if (busy) return;
    if (!zipFile) {
      toast.warning(t('publish.selectZipWarning'));
      return;
    }
    if (!/^\d+\.\d+\.\d+$/.test(versionName.trim())) {
      toast.warning(t('version.invalidVersion'));
      return;
    }
    setBusy(true);
    setStatusLine(t('version.uploading'));
    try {
      // 1. Create the new immutable GameVersion (reused on retry).
      let versionId = draftRef.current.versionId;
      if (!versionId) {
        const version = await api.createVersion(gameId, {
          version: versionName.trim(),
          changelog: changelog.trim(),
        });
        versionId = version.id;
        draftRef.current.versionId = versionId;
      }
      // 2. Hash + create the upload intent (reused on retry).
      let uploadId = draftRef.current.uploadId;
      if (!uploadId) {
        const bytes = await zipFile.arrayBuffer();
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        const sha256 = [...new Uint8Array(digest)]
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        const intent = await api.createUploadIntent(gameId, {
          versionId,
          fileName: zipFile.name,
          fileSize: zipFile.size,
          contentType: 'application/zip',
          sha256,
        });
        uploadId = intent.uploadId;
        draftRef.current.uploadId = uploadId;
      }
      // 3. Upload the ZIP to quarantine through the same-origin API.
      const status = await api.uploadZipDirect(uploadId, zipFile);
      setStatusLine(versionStatusLabel(status.versionStatus));
      draftRef.current = {};
      setZipFile(null);
      setChangelog('');
      toast.success(t('version.submitted'));
      await load();
      pollStatus(uploadId);
    } catch (error) {
      toast.danger(uploadErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const handleApprove = async (versionId: string) => {
    try {
      await api.adminApproveVersion(versionId, 'Owner self-approval from version manager');
      toast.success(t('version.approved'));
      await load();
    } catch (error) {
      toast.danger(uploadErrorMessage(error));
    }
  };

  return (
    <div style={cardStyle} className="bg-glass">
      <div style={headerRowStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <History size={18} color="var(--secondary)" />
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>{t('version.title')}</h2>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          style={{ gap: 6 }}
          onClick={() => void load()}
          title={t('version.refresh')}
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {loadError && <p style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{loadError}</p>}

      {/* Safety notice: the published version is never overwritten in place. */}
      <div style={noticeStyle}>
        <AlertTriangle size={16} color="var(--warning)" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
          {t('version.warning')}
        </span>
      </div>

      {/* Upload-update form (disabled while another update is in flight). */}
      {activeVersion ? (
        <div style={inProgressStyle}>
          <span style={{ fontSize: '0.85rem' }}>
            {t('version.inProgress')} — v{activeVersion.version}:{' '}
            <strong style={{ color: statusBadgeColor(activeVersion.status) }}>
              {versionStatusLabel(activeVersion.status)}
            </strong>
          </span>
          {isOwner && activeVersion.status === 'READY_FOR_REVIEW' && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              style={{ gap: 6 }}
              onClick={() => void handleApprove(activeVersion.id)}
            >
              <ShieldCheck size={14} />
              {t('version.approveNow')}
            </button>
          )}
        </div>
      ) : (
        <div style={formStyle}>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: '1 1 140px', marginBottom: 0 }}>
              <label className="form-label">{t('version.versionName')}</label>
              <input
                type="text"
                value={versionName}
                onChange={(e) => setVersionName(e.target.value)}
                placeholder="1.1.0"
                className="form-input"
              />
            </div>
            <div style={{ flex: '2 1 220px', display: 'flex', alignItems: 'flex-end' }}>
              <label className="btn btn-secondary" style={{ cursor: 'pointer', gap: 6 }}>
                <UploadCloud size={15} />
                <span>{zipFile ? zipFile.name : t('version.selectZip')}</span>
                <input
                  type="file"
                  accept=".zip"
                  onChange={handleZip}
                  disabled={busy}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">{t('version.changelog')}</label>
            <textarea
              value={changelog}
              onChange={(e) => setChangelog(e.target.value)}
              placeholder={t('version.changelogPlaceholder')}
              className="form-input"
              style={{ minHeight: 70, resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{ gap: 6 }}
              disabled={busy || !zipFile}
              onClick={() => void handleSubmit()}
            >
              <UploadCloud size={16} />
              <span>{busy ? t('version.uploading') : t('version.uploadUpdate')}</span>
            </button>
            {statusLine && (
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                {statusLine}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Version history */}
      <div style={{ marginTop: '0.5rem' }}>
        <h3 style={historyTitleStyle}>{t('version.history')}</h3>
        {versions.length === 0 ? (
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            {t('version.noVersions')}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {versions.map((v) => (
              <div key={v.id} style={versionRowStyle}>
                <FileCode size={16} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '0.9rem' }}>v{v.version}</strong>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        color: statusBadgeColor(v.status),
                        border: `1px solid ${statusBadgeColor(v.status)}`,
                        borderRadius: 999,
                        padding: '1px 8px',
                      }}
                    >
                      {versionStatusLabel(v.status)}
                    </span>
                    {v.id === publishedId && (
                      <span style={liveBadgeStyle}>{t('version.published')}</span>
                    )}
                  </div>
                  {v.changelog && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                      {v.changelog}
                    </div>
                  )}
                  {v.rejectReason && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: 2 }}>
                      {v.rejectReason}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', flexShrink: 0 }}>
                  {new Date(v.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const cardStyle: React.CSSProperties = {
  borderRadius: 16,
  border: '1px solid var(--border-color)',
  padding: '1.75rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
};

const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const noticeStyle: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'center',
  padding: '10px 14px',
  borderRadius: 8,
  border: '1px solid var(--primary-border)',
  backgroundColor: 'var(--warning-soft)',
};

const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.85rem',
};

const inProgressStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  flexWrap: 'wrap',
  padding: '10px 14px',
  borderRadius: 8,
  border: '1px solid var(--border-color)',
  backgroundColor: 'var(--surface-1)',
};

const historyTitleStyle: React.CSSProperties = {
  fontSize: '0.95rem',
  fontWeight: 700,
  margin: '0 0 0.5rem',
};

const versionRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid var(--border-color)',
  backgroundColor: 'var(--surface-1)',
};

const liveBadgeStyle: React.CSSProperties = {
  fontSize: '0.68rem',
  fontWeight: 700,
  color: 'var(--success)',
  background: 'var(--success-soft)',
  borderRadius: 999,
  padding: '1px 8px',
};
