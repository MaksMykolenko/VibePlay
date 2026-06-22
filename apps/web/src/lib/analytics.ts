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
    page_path: sanitizePagePath(path),
    page_title: title || document.title,
  });
}

/** Page views intentionally exclude all query/fragment data (tokens, searches, invites). */
export function sanitizePagePath(path: string): string {
  const pathname = path.split(/[?#]/, 1)[0];
  return pathname?.startsWith('/') ? pathname.slice(0, 512) : '/';
}

export type FunnelEvent =
  | 'view_home'
  | 'view_game'
  | 'click_play_game'
  | 'play_started'
  | 'signup_cta_shown'
  | 'signup_cta_clicked'
  | 'login_cta_clicked'
  | 'signup_started'
  | 'signup_success'
  | 'email_verify_success'
  | 'cloud_save_cta_shown'
  | 'cloud_save_sync_prompt_shown'
  | 'cloud_save_sync_accepted'
  | 'cloud_save_sync_skipped'
  | 'creator_access_clicked'
  | 'guest_exit_warning_shown'
  | 'guest_exit_warning_keep_playing'
  | 'guest_exit_warning_leave_anyway'
  | 'guest_exit_warning_signup_clicked'
  | 'guest_exit_warning_login_clicked';

export interface AnalyticsEventParams {
  game_id?: string;
  game_slug?: string;
  source?: string;
  cta_location?: string;
  role?: string;
  logged_in?: boolean;
}

const ALLOWED_EVENT_PARAM_KEYS = new Set<keyof AnalyticsEventParams>([
  'game_id',
  'game_slug',
  'source',
  'cta_location',
  'role',
  'logged_in',
]);

/** Drop unknown, personal, session, and save-data fields before GA receives them. */
export function sanitizeEventParams(params?: object): AnalyticsEventParams {
  const safe: Record<string, string | boolean> = {};
  if (!params) return safe;

  for (const [key, value] of Object.entries(params)) {
    if (!ALLOWED_EVENT_PARAM_KEYS.has(key as keyof AnalyticsEventParams)) continue;
    if (typeof value === 'string') safe[key] = value.slice(0, 100);
    else if (typeof value === 'boolean') safe[key] = value;
  }
  return safe;
}

export function trackEvent(name: FunnelEvent, params?: AnalyticsEventParams): void {
  if (!IS_ANALYTICS_ENABLED) return;
  if (typeof window === 'undefined' || !window.gtag) return;
  window.gtag('event', name, sanitizeEventParams(params));
}
