import React from 'react';
import { Cloud, Heart, MessageCircle, MonitorSmartphone, UploadCloud } from 'lucide-react';
import { useI18n } from '../i18n/useI18n';

export const AccountBenefits: React.FC<{
  onCreateAccount: () => void;
  onLogin: () => void;
}> = ({ onCreateAccount, onLogin }) => {
  const { t } = useI18n();
  const benefits = [
    { icon: Cloud, text: t('accountBenefits.cloudSaves') },
    { icon: MonitorSmartphone, text: t('accountBenefits.otherDevice') },
    { icon: Heart, text: t('accountBenefits.favorites') },
    { icon: MessageCircle, text: t('accountBenefits.comments') },
    { icon: UploadCloud, text: t('accountBenefits.creatorLater') },
  ];

  return (
    <section className="account-benefits" aria-labelledby="account-benefits-title">
      <div>
        <h2 id="account-benefits-title">{t('accountBenefits.title')}</h2>
        <p>{t('accountBenefits.body')}</p>
      </div>
      <ul>
        {benefits.map(({ icon: Icon, text }) => (
          <li key={text}>
            <Icon size={18} aria-hidden="true" />
            <span>{text}</span>
          </li>
        ))}
      </ul>
      <div className="account-benefits__actions">
        <button type="button" className="btn btn-primary" onClick={onCreateAccount}>
          {t('cloudSave.createAccount')}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onLogin}>
          {t('cloudSave.logIn')}
        </button>
      </div>
    </section>
  );
};
