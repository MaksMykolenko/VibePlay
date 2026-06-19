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
