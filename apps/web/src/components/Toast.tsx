import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { useI18n } from '../i18n/useI18n';

export interface ToastItem {
  id: string;
  type: 'success' | 'warning' | 'danger' | 'info';
  message: string;
}

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, number>());
  const { t } = useI18n();

  useEffect(() => {
    const timerMap = timers.current;
    const handleToastEvent = (e: Event) => {
      const customEvent = e as CustomEvent<Omit<ToastItem, 'id'>>;
      const newToast: ToastItem = {
        id: `toast_${Date.now()}_${Math.random()}`,
        type: customEvent.detail.type,
        message: customEvent.detail.message,
      };

      setToasts((prev) => [...prev.slice(-4), newToast]);

      const duration = Math.min(10_000, Math.max(5_000, newToast.message.length * 55));
      const timer = window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
        timerMap.delete(newToast.id);
      }, duration);
      timerMap.set(newToast.id, timer);
    };

    window.addEventListener('vibeplay_toast', handleToastEvent);
    return () => {
      window.removeEventListener('vibeplay_toast', handleToastEvent);
      timerMap.forEach((timer) => window.clearTimeout(timer));
      timerMap.clear();
    };
  }, []);

  const removeToast = (id: string) => {
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="toast-viewport" aria-live="polite" aria-relevant="additions">
      {toasts.map((item) => (
        <div key={item.id} className={`toast-card toast-card--${item.type}`} role="status">
          {getIcon(item.type)}
          <div className="toast-card__content">
            <strong className="toast-card__title">
              {t(`toast.${item.type === 'danger' ? 'error' : item.type}`)}
            </strong>
            <span className="toast-card__message">{item.message}</span>
          </div>
          <button
            onClick={() => removeToast(item.id)}
            className="toast-card__close"
            aria-label={t('toast.close')}
          >
            <X size={18} />
          </button>
        </div>
      ))}
    </div>
  );
};

const getIcon = (type: ToastItem['type']) => {
  switch (type) {
    case 'success':
      return <CheckCircle className="toast-card__icon" size={20} />;
    case 'warning':
      return <AlertTriangle className="toast-card__icon" size={20} />;
    case 'danger':
      return <XCircle className="toast-card__icon" size={20} />;
    case 'info':
      return <Info className="toast-card__icon" size={20} />;
  }
};
