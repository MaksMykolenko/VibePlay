import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpClient } from './http';

describe('creator analytics HTTP client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests the selected range so changing it triggers a distinct fetch', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            range: '30d',
            period: { from: '2026-05-24', to: '2026-06-22' },
            summary: {},
            timeseries: [],
            topGames: [],
            recentActivity: [],
            entitlements: {},
            advanced: null,
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = createHttpClient();

    await client.creatorAnalytics('7d');
    await client.creatorAnalytics('90d');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/creator/analytics?range=7d',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/creator/analytics?range=90d',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});
