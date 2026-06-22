import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { I18nContext } from '../i18n/context';
import { GuestExitWarningModal } from './GuestExitWarningModal';

const translations: Record<string, string> = {
  'guestExit.title': 'Your progress may not be saved',
  'guestExit.body': 'You are playing as a guest. If you leave now, your progress may be lost.',
  'guestExit.keepPlaying': 'Keep playing',
  'guestExit.createAccount': 'Create account',
  'guestExit.logIn': 'Log in',
  'guestExit.leaveAnyway': 'Leave anyway',
};

function render(open: boolean): string {
  return renderToStaticMarkup(
    <I18nContext.Provider
      value={{ locale: 'en', setLocale: () => undefined, t: (key) => translations[key] ?? key }}
    >
      <GuestExitWarningModal
        open={open}
        onKeepPlaying={() => undefined}
        onLeaveAnyway={() => undefined}
        onCreateAccount={() => undefined}
        onLogIn={() => undefined}
      />
    </I18nContext.Provider>,
  );
}

describe('GuestExitWarningModal', () => {
  it('renders an accessible dialog with all four actions when open', () => {
    const markup = render(true);
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('Your progress may not be saved');
    expect(markup).toContain('Keep playing');
    expect(markup).toContain('Create account');
    expect(markup).toContain('Log in');
    expect(markup).toContain('Leave anyway');
  });

  it('renders nothing when closed (never blocks gameplay)', () => {
    expect(render(false)).toBe('');
  });
});
