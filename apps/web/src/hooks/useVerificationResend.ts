import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '../components/toastEvents';
import { useI18n } from '../i18n/useI18n';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api/errors';

const RESEND_COOLDOWN_SECONDS = 60;

export function useVerificationResend() {
  const { t } = useI18n();
  const [cooldown, setCooldown] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const sendingRef = useRef(false);

  useEffect(() => {
    if (cooldown === 0) return;
    const timer = window.setTimeout(() => {
      setCooldown((seconds) => Math.max(0, seconds - 1));
    }, 1_000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const resend = useCallback(async (): Promise<boolean> => {
    if (sendingRef.current || cooldown > 0) return false;
    sendingRef.current = true;
    setIsSending(true);

    try {
      await api.resendVerification();
      setCooldown(RESEND_COOLDOWN_SECONDS);
      toast.success(t('verification.sent'));
      return true;
    } catch (error) {
      toast.danger(errorMessage(error));
      return false;
    } finally {
      sendingRef.current = false;
      setIsSending(false);
    }
  }, [cooldown, t]);

  return { cooldown, isSending, resend };
}
