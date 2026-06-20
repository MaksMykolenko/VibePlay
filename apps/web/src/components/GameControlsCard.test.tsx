import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GameControlsCard } from './GameControlsCard';

describe('GameControlsCard', () => {
  it('renders user-provided controls as escaped React text', () => {
    const markup = renderToStaticMarkup(
      <GameControlsCard
        title="Controls"
        controls={[
          {
            action: '<script>alert("action")</script>',
            keys: '<img src=x onerror=alert("keys")>',
          },
        ]}
      />,
    );

    expect(markup).not.toContain('<script>');
    expect(markup).not.toContain('<img');
    expect(markup).toContain('&lt;script&gt;');
    expect(markup).toContain('&lt;img');
  });
});
