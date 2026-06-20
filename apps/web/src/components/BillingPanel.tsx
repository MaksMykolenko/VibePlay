import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { BillingMeDto, BillingStatus } from '@vibeplay/shared';
import { Check, CreditCard, Crown, LoaderCircle } from 'lucide-react';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api/errors';
import { useI18n } from '../i18n/useI18n';
import { toast } from './toastEvents';

const BENEFIT_KEYS = [
  'billing.benefit.games',
  'billing.benefit.uploads',
  'billing.benefit.versions',
  'billing.benefit.analytics',
  'billing.benefit.badge',
  'billing.benefit.priority',
] as const;

function statusLabel(status: BillingStatus, t: ReturnType<typeof useI18n>['t']): string {
  switch (status) {
    case 'active':
      return t('billing.status.active');
    case 'trialing':
      return t('billing.status.trialing');
    case 'past_due':
      return t('billing.status.pastDue');
    case 'canceled':
      return t('billing.status.canceled');
    case 'incomplete':
      return t('billing.status.incomplete');
    case 'incomplete_expired':
      return t('billing.status.expired');
    case 'unpaid':
      return t('billing.status.unpaid');
    case 'paused':
      return t('billing.status.paused');
  }
}

export function BillingPanel({ canUpgrade }: { canUpgrade: boolean }) {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const [billing, setBilling] = useState<BillingMeDto | null>(null);
  const [busy, setBusy] = useState<'checkout' | 'portal' | null>(null);

  useEffect(() => {
    let active = true;
    api
      .billingMe()
      .then((value) => {
        if (active) setBilling(value);
      })
      .catch((error) => toast.danger(errorMessage(error)));
    return () => {
      active = false;
    };
  }, []);

  const redirect = async (target: 'checkout' | 'portal') => {
    setBusy(target);
    try {
      const { url } =
        target === 'checkout' ? await api.createBillingCheckout() : await api.createBillingPortal();
      window.location.assign(url);
    } catch (error) {
      toast.danger(errorMessage(error));
      setBusy(null);
    }
  };

  if (!billing) {
    return (
      <div className="billing-loading">
        <LoaderCircle className="spin" size={22} aria-hidden="true" />
        {t('billing.loading')}
      </div>
    );
  }

  const isPlus = billing.plan === 'CREATOR_PLUS';
  const canStartCheckout =
    billing.status === null ||
    billing.status === 'canceled' ||
    billing.status === 'incomplete_expired';
  return (
    <div className="billing-panel animate-fade">
      <div>
        <h2 className="billing-panel__title">{t('billing.title')}</h2>
        <p className="billing-panel__description">{t('billing.description')}</p>
      </div>

      {searchParams.get('success') === '1' && (
        <p className="billing-notice">{t('billing.checkoutComplete')}</p>
      )}
      {searchParams.get('canceled') === '1' && (
        <p className="billing-notice">{t('billing.checkoutCanceled')}</p>
      )}

      <div className="billing-current-plan">
        <div>
          <span>{t('billing.currentPlan')}</span>
          <strong>{isPlus ? t('billing.creatorPlus') : t('billing.free')}</strong>
        </div>
        {billing.status && (
          <span className="badge badge-secondary">{statusLabel(billing.status, t)}</span>
        )}
      </div>

      {billing.cancelAtPeriodEnd && billing.currentPeriodEnd && (
        <p className="billing-notice">
          {t('billing.canceling', {
            date: new Date(billing.currentPeriodEnd).toLocaleDateString(),
          })}
        </p>
      )}

      <div className="billing-pricing-grid">
        <article className={!isPlus ? 'billing-plan billing-plan--current' : 'billing-plan'}>
          <h3>{t('billing.free')}</h3>
          <div className="billing-price">$0</div>
          <p>{t('billing.freeDescription')}</p>
          <ul>
            <li>
              <Check size={15} />
              {t('billing.freeGame')}
            </li>
            <li>
              <Check size={15} />
              {t('billing.freeUpload')}
            </li>
            <li>
              <Check size={15} />
              {t('billing.basicAnalytics')}
            </li>
          </ul>
        </article>

        <article
          className={
            isPlus
              ? 'billing-plan billing-plan--plus billing-plan--current'
              : 'billing-plan billing-plan--plus'
          }
        >
          <div className="billing-plan__heading">
            <Crown size={20} aria-hidden="true" />
            <h3>{t('billing.creatorPlus')}</h3>
          </div>
          <div className="billing-price">
            $3 <small>{t('billing.perMonth')}</small>
          </div>
          <ul>
            {BENEFIT_KEYS.map((key) => (
              <li key={key}>
                <Check size={15} />
                {t(key)}
              </li>
            ))}
          </ul>
          {isPlus || !canStartCheckout ? (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy !== null}
              onClick={() => void redirect('portal')}
            >
              <CreditCard size={16} />
              {busy === 'portal' ? t('billing.redirecting') : t('billing.manage')}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canUpgrade || busy !== null}
              onClick={() => void redirect('checkout')}
            >
              <Crown size={16} />
              {busy === 'checkout' ? t('billing.redirecting') : t('billing.upgrade')}
            </button>
          )}
          {!canUpgrade && <small>{t('billing.creatorRequired')}</small>}
        </article>
      </div>
    </div>
  );
}
