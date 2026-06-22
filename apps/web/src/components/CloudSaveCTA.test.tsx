import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { I18nContext } from '../i18n/context';
import { CloudSaveCTA } from './CloudSaveCTA';

const translations: Record<string, string> = {
  'common.close': 'Close',
  'cloudSave.ctaTitle': 'Want to keep your progress?',
  'cloudSave.ctaBody': 'Create a free account to save progress.',
  'cloudSave.createAccount': 'Create account',
  'cloudSave.logIn': 'Log in',
  'cloudSave.continuePlaying': 'Continue playing',
};

function render(isGuest: boolean): string {
  return renderToStaticMarkup(
    <I18nContext.Provider
      value={{ locale: 'en', setLocale: () => undefined, t: (key) => translations[key] ?? key }}
    >
      <button type="button">Play now</button>
      <CloudSaveCTA
        isGuest={isGuest}
        onCreateAccount={() => undefined}
        onLogin={() => undefined}
        onContinueGuest={() => undefined}
      />
    </I18nContext.Provider>,
  );
}

describe('CloudSaveCTA', () => {
  it('renders guest actions without replacing or disabling Play', () => {
    const markup = render(true);
    expect(markup).toContain('Play now');
    expect(markup).toContain('Create account');
    expect(markup).toContain('Log in');
    expect(markup).toContain('Continue playing');
    expect(markup).not.toContain('disabled');
  });

  it('does not render for a logged-in player', () => {
    const markup = render(false);
    expect(markup).toContain('Play now');
    expect(markup).not.toContain('Want to keep your progress?');
  });
});
