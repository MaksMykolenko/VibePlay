/**
 * Playwright starts webServer before globalSetup, so the isolated stack must
 * build workspace packages and fixtures before importing start.ts. Keeping
 * this as one process also makes clean CI checkouts deterministic.
 */
import prepare from './global-setup.js';

prepare();
await import('./start.js');
