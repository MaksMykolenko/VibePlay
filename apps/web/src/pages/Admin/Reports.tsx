import React, { useEffect, useState } from 'react';
import { useGames } from '../../hooks/useGames';
import type { FeedbackItem } from '../../lib/api/types';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/api/errors';
import { toast } from '../../components/toastEvents';
import { useI18n } from '../../i18n/useI18n';
import { CheckCircle, XCircle } from 'lucide-react';

export const AdminReports: React.FC = () => {
  const { t, locale } = useI18n();
  const { reports, resolveReport, dismissReport } = useGames();
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);

  useEffect(() => {
    void api
      .adminListFeedback({ page: 1 })
      .then((result) => setFeedback(result.items))
      .catch((error) => toast.danger(errorMessage(error)));
  }, []);

  const handleResolve = (id: string) => {
    resolveReport(id);
    toast.success(t('admin.reports.markedResolved'));
  };

  const handleDismiss = (id: string) => {
    dismissReport(id);
    toast.info(t('admin.reports.dismissed'));
  };

  const handleFeedbackResolve = async (id: string) => {
    try {
      await api.adminResolveFeedback(id);
      setFeedback((items) =>
        items.map((item) =>
          item.id === id
            ? { ...item, status: 'RESOLVED', resolvedAt: new Date().toISOString() }
            : item,
        ),
      );
      toast.success(t('admin.reports.feedbackResolved'));
    } catch (error) {
      toast.danger(errorMessage(error));
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'resolved':
        return <span className="badge badge-success">{t('admin.reports.statusResolved')}</span>;
      case 'dismissed':
        return <span className="badge badge-secondary">{t('admin.reports.statusDismissed')}</span>;
      case 'reviewing':
        return <span className="badge badge-warning">{t('admin.reports.statusReviewing')}</span>;
      default:
        return <span className="badge badge-danger">{t('admin.reports.statusOpen')}</span>;
    }
  };

  return (
    <div style={containerStyle} className="animate-fade">
      {/* Header */}
      <div>
        <h1>{t('admin.systemReports')}</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>
          {t('admin.reports.subtitle')}
        </p>
      </div>

      <hr style={hrStyle} />

      <section style={listAreaStyle}>
        <div>
          <h2 style={{ fontSize: '1.2rem' }}>{t('admin.reports.feedbackTitle')}</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
            {t('admin.reports.feedbackSubtitle')}
          </p>
        </div>
        {feedback.length === 0 ? (
          <div style={emptyContainerStyle}>
            <CheckCircle size={40} color="var(--success)" style={{ opacity: 0.3 }} />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {t('admin.reports.noFeedback')}
            </span>
          </div>
        ) : (
          feedback.map((item) => (
            <article key={item.id} style={reportCardStyle} className="bg-glass">
              <div style={cardHeaderStyle}>
                <strong>
                  {item.category === 'BUG'
                    ? t('admin.reports.bugReport')
                    : t('admin.reports.feedback')}
                </strong>
                <span
                  className={`badge ${item.status === 'OPEN' ? 'badge-warning' : 'badge-success'}`}
                >
                  {item.status === 'OPEN'
                    ? t('admin.reports.statusOpen')
                    : t('admin.reports.statusResolved')}
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {item.user ? `@${item.user.username}` : t('admin.reports.deletedUser')} ·{' '}
                {new Date(item.createdAt).toLocaleString(locale)} ·{' '}
                {item.page || t('admin.reports.unknownPage')}
              </div>
              <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{item.message}</p>
              {item.status === 'OPEN' && (
                <div style={actionsRowStyle}>
                  <button
                    type="button"
                    className="btn btn-success btn-sm"
                    onClick={() => void handleFeedbackResolve(item.id)}
                  >
                    <CheckCircle size={12} />
                    {t('admin.reports.resolveFeedback')}
                  </button>
                </div>
              )}
            </article>
          ))
        )}
      </section>

      <hr style={hrStyle} />

      {/* Reports Directory */}
      <div style={listAreaStyle}>
        {reports.length === 0 ? (
          <div style={emptyContainerStyle}>
            <CheckCircle
              size={48}
              color="var(--success)"
              style={{ opacity: 0.3, marginBottom: '1rem' }}
            />
            <h3>{t('admin.noReports')}</h3>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {t('admin.reports.healthy')}
            </span>
          </div>
        ) : (
          reports.map((r) => (
            <div
              key={r.id}
              style={{
                ...reportCardStyle,
                borderLeft:
                  r.status === 'open' ? '4px solid var(--danger)' : '4px solid transparent',
              }}
              className="bg-glass"
            >
              <div style={cardHeaderStyle}>
                <div>
                  <strong style={{ fontSize: '1rem' }}>
                    {t('admin.reports.reportNo', { id: r.id.split('_')[1] || r.id })}
                  </strong>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--text-secondary)',
                      marginLeft: '12px',
                    }}
                  >
                    {t('admin.reports.filedOn', {
                      date: new Date(r.timestamp).toLocaleString(locale),
                    })}
                  </span>
                </div>
                {getStatusBadge(r.status)}
              </div>

              <div style={metaGridStyle}>
                <div>
                  <strong>{t('admin.reports.reporter')}</strong>
                  <span style={valStyle}>@{r.reporterName}</span>
                </div>
                <div>
                  <strong>{t('admin.reports.target')}</strong>
                  <span style={valStyle}>
                    {r.targetType.toUpperCase()} ({r.targetName})
                  </span>
                </div>
              </div>

              <div style={reasonBoxStyle}>
                <strong>{t('admin.reports.reason')}</strong>
                <p
                  style={{
                    fontSize: '0.9rem',
                    color: 'var(--text-secondary)',
                    marginTop: '4px',
                    lineHeight: 1.4,
                  }}
                >
                  {r.reason}
                </p>
              </div>

              {r.status === 'open' && (
                <div style={actionsRowStyle}>
                  <button
                    onClick={() => handleResolve(r.id)}
                    className="btn btn-success btn-sm"
                    style={{ gap: '4px' }}
                  >
                    <CheckCircle size={12} />
                    {t('admin.reports.resolve')}
                  </button>
                  <button
                    onClick={() => handleDismiss(r.id)}
                    className="btn btn-secondary btn-sm"
                    style={{ gap: '4px' }}
                  >
                    <XCircle size={12} />
                    {t('admin.reports.dismiss')}
                  </button>
                </div>
              )}
            </div>
          ))
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
};

const hrStyle: React.CSSProperties = {
  border: 'none',
  borderTop: '1px solid var(--border-color)',
  margin: '0.25rem 0',
};

const listAreaStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
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
};

const reportCardStyle: React.CSSProperties = {
  padding: '1.5rem',
  borderRadius: '12px',
  border: '1px solid var(--border-color)',
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
};

const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const metaGridStyle: React.CSSProperties = {
  display: 'flex',
  gap: '2rem',
  fontSize: '0.85rem',
  flexWrap: 'wrap',
};

const valStyle: React.CSSProperties = {
  marginLeft: '6px',
  color: 'var(--secondary)',
  fontWeight: 600,
};

const reasonBoxStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-surface)',
  border: '1px solid var(--border-color)',
  borderRadius: '8px',
  padding: '12px',
};

const actionsRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '10px',
  marginTop: '0.5rem',
};
