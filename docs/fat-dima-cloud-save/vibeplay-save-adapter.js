/**
 * VibePlay cloud-save adapter for Fat Dima Simulator (standalone drop-in).
 * ---------------------------------------------------------------------------
 * Keeps the existing localStorage save working EXACTLY as before, and layers
 * VibePlay cloud saves on top when the game runs inside VibePlay and the player
 * is logged in. It is framework-agnostic (vanilla ES module) and has no deps.
 *
 * Existing game save (unchanged):
 *   localStorage key : "dima_fat_simulator_settings"
 *   settingsVersion  : 2
 *
 * Load logic:
 *   guest                                   → localStorage only
 *   logged in + cloud save exists           → load cloud save
 *   logged in + no cloud + local save exists→ keep local, announce it so VibePlay
 *                                             can offer to sync it after login
 *   cloud error                             → fallback to localStorage
 *   not running on VibePlay                 → localStorage only
 *
 * Save logic:
 *   always write localStorage (fallback)
 *   if VibePlay available AND logged in     → debounced cloud sync (SDK throttles
 *                                             to ≤ once / 10s; important events flush)
 *   guest                                   → localStorage only
 *
 * Important events (pass { important: true } to save / use markImportantEvent):
 *   level up · quest complete · achievement unlock · settings/save-menu action ·
 *   pause/exit.
 *
 * Usage:
 *   import { createVibePlaySaveAdapter } from './vibeplay-save-adapter.js';
 *   const cloud = createVibePlaySaveAdapter();   // defaults are fine
 *   await cloud.init();                          // after the page/SDK loads
 *   const settings = await cloud.load();         // cloud or local per rules
 *   // ... gameplay ...
 *   cloud.save(settings);                        // debounced
 *   cloud.markImportantEvent(settings, 'level_up'); // flush + progress signal
 */

export const FAT_DIMA_LS_KEY = 'dima_fat_simulator_settings';
export const FAT_DIMA_SETTINGS_VERSION = 2;

/** Bilingual strings for any UI the adapter itself surfaces (EN/UK). */
export const STRINGS = {
  en: {
    syncedToCloud: 'Progress synced to your VibePlay account.',
    cloudUnavailable:
      'Cloud saves are unavailable right now — your progress is saved on this device.',
    loadedFromCloud: 'Loaded your saved progress from the cloud.',
  },
  uk: {
    syncedToCloud: 'Прогрес синхронізовано з вашим акаунтом VibePlay.',
    cloudUnavailable:
      'Хмарні збереження зараз недоступні — ваш прогрес збережено на цьому пристрої.',
    loadedFromCloud: 'Завантажено ваш збережений прогрес із хмари.',
  },
};

function getWindow() {
  return typeof window !== 'undefined' ? window : undefined;
}

/** Wait until the VibePlay bridge has handshaken (or give up after timeoutMs). */
async function waitForVibe(vibe, timeoutMs) {
  if (!vibe || !vibe.save || typeof vibe.save.isAvailable !== 'function') return false;
  const start = Date.now();
  while (!vibe.save.isAvailable()) {
    if (Date.now() - start > timeoutMs) return false;
    await new Promise((r) => setTimeout(r, 100));
  }
  return true;
}

/**
 * @param {object} [options]
 * @param {Storage} [options.storage]      localStorage-like store (default: window.localStorage)
 * @param {object}  [options.vibe]         VibePlay SDK instance (default: window.VibePlay)
 * @param {string}  [options.lsKey]        localStorage key (default: dima_fat_simulator_settings)
 * @param {number}  [options.schemaVersion] save format version (default: 2)
 * @param {number}  [options.readyTimeoutMs] how long to wait for the SDK (default: 4000)
 * @param {(s: object) => void} [options.onCloudLoaded] called with cloud data when used
 * @param {object}  [options.logger]       console-like logger (default: console)
 */
export function createVibePlaySaveAdapter(options = {}) {
  const win = getWindow();
  const storage = options.storage ?? (win ? win.localStorage : undefined);
  const lsKey = options.lsKey ?? FAT_DIMA_LS_KEY;
  const schemaVersion = options.schemaVersion ?? FAT_DIMA_SETTINGS_VERSION;
  const readyTimeoutMs = options.readyTimeoutMs ?? 4000;
  const logger =
    options.logger ?? (typeof console !== 'undefined' ? console : { warn() {}, info() {} });
  // Resolve the SDK lazily each call so an adapter created before the SDK loads
  // still works once window.VibePlay appears.
  const getVibe = () => options.vibe ?? (win ? win.VibePlay : undefined);

  function readLocal() {
    if (!storage) return null;
    try {
      const raw = storage.getItem(lsKey);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      logger.warn?.('[vibeplay-save] failed to read local save', err);
      return null;
    }
  }

  function writeLocal(settings) {
    if (!storage) return;
    try {
      storage.setItem(lsKey, JSON.stringify(settings));
    } catch (err) {
      logger.warn?.('[vibeplay-save] failed to write local save', err);
    }
  }

  function cloudUsable() {
    const vibe = getVibe();
    return !!(
      vibe &&
      vibe.save &&
      typeof vibe.save.isAvailable === 'function' &&
      vibe.save.isAvailable()
    );
  }

  async function isLoggedIn() {
    const vibe = getVibe();
    if (!cloudUsable()) return false;
    try {
      const res = await vibe.save.getStatus();
      return !!(res && res.status && res.status.loggedIn);
    } catch {
      return false;
    }
  }

  return {
    FAT_DIMA_LS_KEY: lsKey,
    schemaVersion,

    /** Direct access to the local save (used by tests / manual fallback). */
    readLocal,
    writeLocal,
    cloudUsable,
    isLoggedIn,

    /**
     * Wire up VibePlay integration: register a provider so VibePlay can pull the
     * local save for syncing after login, and announce that a local save exists.
     * Safe to call when not on VibePlay (it just no-ops).
     */
    async init() {
      const vibe = getVibe();
      if (!vibe || !vibe.save) return this;
      // Let the platform request this device's local save (Phase 4 sync flow).
      if (typeof vibe.save.onLocalSaveRequested === 'function') {
        vibe.save.onLocalSaveRequested(() => {
          const local = readLocal();
          return local != null ? { data: local, schemaVersion } : null;
        });
      }
      // Announce local progress once the bridge is ready so VibePlay can offer
      // to sync it to the account.
      const ready = await waitForVibe(vibe, readyTimeoutMs);
      if (ready && typeof vibe.save.reportLocalSave === 'function') {
        const local = readLocal();
        if (local != null) vibe.save.reportLocalSave({ has: true, schemaVersion });
      }
      return this;
    },

    /**
     * Resolve the settings to load, following the load logic above. Always
     * returns synchronously-usable data (cloud object or local object or null).
     */
    async load() {
      const local = readLocal();
      const vibe = getVibe();

      // Not on VibePlay (or SDK never becomes ready) → localStorage only.
      const ready = await waitForVibe(vibe, readyTimeoutMs);
      if (!ready) return local;

      // Guest → localStorage only.
      if (!(await isLoggedIn())) return local;

      // Logged in → try the cloud, but never let a cloud problem lose progress.
      try {
        const res = await vibe.save.get();
        if (res && res.code === 'ok' && res.data != null) {
          options.onCloudLoaded?.(res.data);
          return res.data; // cloud save exists → authoritative
        }
        if (res && res.code === 'not_found') {
          // No cloud yet. Keep local and announce it so VibePlay can offer sync.
          if (local != null && typeof vibe.save.reportLocalSave === 'function') {
            vibe.save.reportLocalSave({ has: true, schemaVersion });
          }
          return local;
        }
        // auth_required / rate_limited / error / unavailable → fallback.
        return local;
      } catch (err) {
        logger.warn?.('[vibeplay-save] cloud load failed, using local', err);
        return local;
      }
    },

    /**
     * Persist settings. ALWAYS writes localStorage; additionally performs a
     * (debounced) cloud sync when available + logged in. `important` flushes the
     * SDK throttle immediately for key events.
     * @returns {Promise<{code: string}>} the cloud result (or a local-only marker)
     */
    save(settings, opts = {}) {
      writeLocal(settings); // fallback first — never lose local progress
      const vibe = getVibe();
      if (cloudUsable() && typeof vibe.save.set === 'function') {
        // The SDK throttles writes (≤ once / 10s) unless important=true. Guests
        // resolve { code: 'auth_required' } here, which we treat as harmless.
        return Promise.resolve(
          vibe.save.set(settings, { schemaVersion, important: !!opts.important }),
        ).catch(() => ({ code: 'error' }));
      }
      return Promise.resolve({ code: 'unavailable' });
    },

    /**
     * Convenience for important moments (level up, quest complete, achievement,
     * settings/save-menu action, pause/exit): flushes the cloud save now AND
     * signals progress so VibePlay can time its "create account" CTA.
     */
    markImportantEvent(settings, kind) {
      const vibe = getVibe();
      if (vibe && typeof vibe.reportProgress === 'function') {
        try {
          vibe.reportProgress(kind);
        } catch {
          /* non-fatal */
        }
      }
      return this.save(settings, { important: true });
    },
  };
}

// Script-tag convenience: window.VibePlaySaveAdapter.create(...)
const _win = getWindow();
if (_win) {
  _win.VibePlaySaveAdapter = {
    create: createVibePlaySaveAdapter,
    FAT_DIMA_LS_KEY,
    FAT_DIMA_SETTINGS_VERSION,
    STRINGS,
  };
}
