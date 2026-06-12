import React, { useState, useEffect } from 'react';
import { CheckCircle, AlertTriangle, XCircle, Info, X } from 'lucide-react';

export interface ToastItem {
  id: string;
  type: 'success' | 'warning' | 'danger' | 'info';
  message: string;
}

// Global utility functions to trigger toasts from anywhere
export const toast = {
  success: (msg: string) => {
    window.dispatchEvent(new CustomEvent('vibeplay_toast', { detail: { type: 'success', message: msg } }));
  },
  warning: (msg: string) => {
    window.dispatchEvent(new CustomEvent('vibeplay_toast', { detail: { type: 'warning', message: msg } }));
  },
  danger: (msg: string) => {
    window.dispatchEvent(new CustomEvent('vibeplay_toast', { detail: { type: 'danger', message: msg } }));
  },
  info: (msg: string) => {
    window.dispatchEvent(new CustomEvent('vibeplay_toast', { detail: { type: 'info', message: msg } }));
  }
};

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handleToastEvent = (e: Event) => {
      const customEvent = e as CustomEvent<Omit<ToastItem, 'id'>>;
      const newToast: ToastItem = {
        id: `toast_${Date.now()}_${Math.random()}`,
        type: customEvent.detail.type,
        message: customEvent.detail.message
      };
      
      setToasts(prev => [...prev, newToast]);

      // Automatically remove after 4 seconds
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== newToast.id));
      }, 4000);
    };

    window.addEventListener('vibeplay_toast', handleToastEvent);
    return () => window.removeEventListener('vibeplay_toast', handleToastEvent);
  }, []);

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return (
    <div style={containerStyle}>
      {toasts.map(t => (
        <div key={t.id} style={{ ...toastCardStyle, ...typeStyles[t.type] }} className="animate-fade">
          {getIcon(t.type)}
          <span style={messageStyle}>{t.message}</span>
          <button onClick={() => removeToast(t.id)} style={closeButtonStyle}>
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
};

const getIcon = (type: ToastItem['type']) => {
  switch (type) {
    case 'success': return <CheckCircle size={18} color="var(--success)" />;
    case 'warning': return <AlertTriangle size={18} color="var(--warning)" />;
    case 'danger': return <XCircle size={18} color="var(--danger)" />;
    case 'info': return <Info size={18} color="var(--info)" />;
  }
};

const containerStyle: React.CSSProperties = {
  position: 'fixed',
  top: '20px',
  right: '20px',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  zIndex: 99999,
  maxWidth: '350px',
  width: 'calc(100% - 40px)',
  pointerEvents: 'none'
};

const toastCardStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '12px 16px',
  borderRadius: '8px',
  boxShadow: 'var(--shadow-elevated)',
  border: '1px solid var(--border-subtle)',
  pointerEvents: 'auto',
  fontSize: '0.9rem',
  fontWeight: 500,
  animation: 'slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards'
};

const messageStyle: React.CSSProperties = {
  flex: 1,
  color: 'var(--text-primary)'
};

const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  padding: '2px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  opacity: 0.7,
  transition: 'opacity 0.2s'
};

const typeStyles: Record<ToastItem['type'], React.CSSProperties> = {
  success: {
    backgroundColor: 'var(--success-soft)',
    borderColor: 'var(--success-soft)'
  },
  warning: {
    backgroundColor: 'var(--warning-soft)',
    borderColor: 'var(--warning-soft)'
  },
  danger: {
    backgroundColor: 'var(--danger-soft)',
    borderColor: 'var(--danger-soft)'
  },
  info: {
    backgroundColor: 'var(--info-soft)',
    borderColor: 'var(--info-soft)'
  }
};
