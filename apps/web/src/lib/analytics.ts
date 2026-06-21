declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dataLayer?: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gtag?: (...args: any[]) => void;
  }
}

const MEASUREMENT_ID = 'G-QCRFCTCTPG';
const IS_ANALYTICS_ENABLED = import.meta.env.PROD && import.meta.env.APP_MODE === 'real';

export function initGA(): void {
  if (!IS_ANALYTICS_ENABLED) return;
  if (typeof window === 'undefined') return;

  // Prevent duplicate initialization
  if (window.gtag) return;

  // Initialize dataLayer and gtag function
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer?.push(arguments);
  };

  // Configure GA with send_page_view: false to prevent duplicate page views on first load
  window.gtag('js', new Date());
  window.gtag('config', MEASUREMENT_ID, { send_page_view: false });

  // Load the script element dynamically
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.appendChild(script);
}

export function trackPageView(path: string, title?: string): void {
  if (!IS_ANALYTICS_ENABLED) return;
  if (typeof window === 'undefined' || !window.gtag) return;

  window.gtag('event', 'page_view', {
    page_path: path,
    page_title: title || document.title,
  });
}

/**
 * Cloud-save / conversion funnel events (spec Phase 6). GA4-safe:
 * - only fire in the real production build (same gate as page views);
 * - parameters are limited to small scalar metadata (ids/slugs/reasons).
 *
 * IMPORTANT: never pass save DATA or any user content here — only the metadata
 * keys below are accepted, and only string/number/boolean values are forwarded.
 */
export type CloudSaveEvent =
  | 'cloud_save_cta_shown'
  | 'cloud_save_cta_create_account_click'
  | 'cloud_save_cta_continue_guest_click'
  | 'cloud_save_auth_required'
  | 'cloud_save_sync_prompt_shown'
  | 'cloud_save_synced'
  | 'cloud_save_sync_failed'
  | 'signup_returned_to_game'
  | 'cloud_save_loaded';

/** Allowed parameter keys. Anything else is dropped so save data can't leak. */
const ALLOWED_EVENT_PARAM_KEYS = new Set(['game_id', 'game_slug', 'source', 'reason', 'trigger']);

export function trackEvent(
  name: CloudSaveEvent,
  params?: Record<string, string | number | boolean>,
): void {
  if (!IS_ANALYTICS_ENABLED) return;
  if (typeof window === 'undefined' || !window.gtag) return;

  const safe: Record<string, string | number | boolean> = {};
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (!ALLOWED_EVENT_PARAM_KEYS.has(k)) continue;
      if (typeof v === 'string') safe[k] = v.slice(0, 100);
      else if (typeof v === 'number' || typeof v === 'boolean') safe[k] = v;
    }
  }
  window.gtag('event', name, safe);
}
