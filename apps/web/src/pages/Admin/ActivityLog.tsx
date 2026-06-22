import React from 'react';
import { useI18n } from '../../i18n/useI18n';
import { useGames } from '../../hooks/useGames';
import { Terminal } from 'lucide-react';

export const AdminActivityLog: React.FC = () => {
  const { t } = useI18n();
  const { activityLogs } = useGames();

  const getActionColor = (action: string) => {
    if (action.includes('Approve')) return 'var(--success)';
    if (action.includes('Reject') || action.includes('Ban')) return 'var(--danger)';
    if (action.includes('Feature')) return 'var(--secondary)';
    return 'var(--text-primary)';
  };

  return (
    <div style={containerStyle} className="animate-fade">
      {/* Header */}
      <div>
        <h1>{t('admin.activityLog')}</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>
          {t('admin.activityLog.subtitle')}
        </p>
      </div>

      <hr style={hrStyle} />

      {/* Console log list */}
      <div style={consoleWrapperStyle} className="bg-glass">
        <div style={consoleHeaderStyle}>
          <Terminal size={14} color="var(--text-secondary)" />
          <span>{t('admin.activityLog.consoleTitle')}</span>
        </div>

        <div style={logsContainerStyle}>
          {activityLogs.length === 0 ? (
            <div style={emptyTextStyle}>{t('admin.noLogs')}</div>
          ) : (
            activityLogs.map((log) => (
              <div key={log.id} style={logItemStyle}>
                <div style={logMetaRowStyle}>
                  <span style={timestampStyle}>[{new Date(log.timestamp).toISOString()}]</span>
                  <span style={operatorStyle}>
                    {t('admin.log.operator', { name: log.adminName })}
                  </span>
                  <span style={{ ...actionStyle, color: getActionColor(log.action) }}>
                    {t('admin.log.action', { action: log.action.toUpperCase() })}
                  </span>
                </div>

                <div style={logBodyRowStyle}>
                  {t('admin.log.target', {
                    type: log.targetType.toUpperCase(),
                    name: log.targetName,
                    id: log.targetId,
                  })}
                  {log.details && (
                    <div style={detailsStyle}>
                      {t('admin.log.diagnostics', { details: log.details })}
                    </div>
                  )}
                </div>
              </div>
            ))
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
};

const hrStyle: React.CSSProperties = {
  border: 'none',
  borderTop: '1px solid var(--border-color)',
  margin: '0.25rem 0',
};

const consoleWrapperStyle: React.CSSProperties = {
  border: '1px solid var(--border-color)',
  borderRadius: '12px',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: '#05070D',
};

const consoleHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '10px 14px',
  backgroundColor: 'rgba(255,255,255,0.02)',
  borderBottom: '1px solid var(--border-color)',
  fontSize: '0.75rem',
  color: 'var(--text-secondary)',
  fontWeight: 600,
  fontFamily: 'Courier, monospace',
};

const logsContainerStyle: React.CSSProperties = {
  padding: '1.5rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '1.25rem',
  fontFamily: 'Courier, monospace',
  fontSize: '0.8rem',
  maxHeight: '450px',
  overflowY: 'auto',
  lineHeight: 1.5,
};

const emptyTextStyle: React.CSSProperties = {
  textAlign: 'center',
  color: 'var(--text-secondary)',
  padding: '2rem',
};

const logItemStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

const logMetaRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '12px',
  flexWrap: 'wrap',
};

const timestampStyle: React.CSSProperties = {
  color: 'var(--text-secondary)',
};

const operatorStyle: React.CSSProperties = {
  color: 'var(--secondary)',
};

const actionStyle: React.CSSProperties = {
  fontWeight: 600,
};

const logBodyRowStyle: React.CSSProperties = {
  paddingLeft: '1rem',
  color: '#c9d1d9',
};

const detailsStyle: React.CSSProperties = {
  color: 'var(--text-secondary)',
  marginTop: '2px',
};
