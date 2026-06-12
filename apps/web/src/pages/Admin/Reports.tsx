import React from 'react';
import { useGames } from '../../hooks/useGames';

import { toast } from '../../components/toastEvents';
import { CheckCircle, XCircle } from 'lucide-react';

export const AdminReports: React.FC = () => {
  const { reports, resolveReport, dismissReport } = useGames();

  const handleResolve = (id: string) => {
    resolveReport(id);
    toast.success('Report marked as Resolved.');
  };

  const handleDismiss = (id: string) => {
    dismissReport(id);
    toast.info('Report dismissed.');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'resolved':
        return <span className="badge badge-success">Resolved</span>;
      case 'dismissed':
        return <span className="badge badge-secondary">Dismissed</span>;
      case 'reviewing':
        return <span className="badge badge-warning">Reviewing</span>;
      default:
        return <span className="badge badge-danger">Open</span>;
    }
  };

  return (
    <div style={containerStyle} className="animate-fade">
      {/* Header */}
      <div>
        <h1>System Reports</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>
          Review complaints lodged by players regarding games or comments.
        </p>
      </div>

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
            <h3>No Reports</h3>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              VibePlay platform is running smoothly.
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
                  <strong style={{ fontSize: '1rem' }}>Report #{r.id.split('_')[1] || r.id}</strong>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--text-secondary)',
                      marginLeft: '12px',
                    }}
                  >
                    Filed on {new Date(r.timestamp).toLocaleString()}
                  </span>
                </div>
                {getStatusBadge(r.status)}
              </div>

              <div style={metaGridStyle}>
                <div>
                  <strong>Reporter:</strong>
                  <span style={valStyle}>@{r.reporterName}</span>
                </div>
                <div>
                  <strong>Target:</strong>
                  <span style={valStyle}>
                    {r.targetType.toUpperCase()} ({r.targetName})
                  </span>
                </div>
              </div>

              <div style={reasonBoxStyle}>
                <strong>Reason:</strong>
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
                    Resolve Report
                  </button>
                  <button
                    onClick={() => handleDismiss(r.id)}
                    className="btn btn-secondary btn-sm"
                    style={{ gap: '4px' }}
                  >
                    <XCircle size={12} />
                    Dismiss Report
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
