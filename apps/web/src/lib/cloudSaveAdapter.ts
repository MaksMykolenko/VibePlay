/**
 * Builds the host-side save adapter the Play Page injects into the GameBridge.
 *
 * The bridge stays free of auth concerns: this adapter performs the authenticated
 * API calls (cookie + CSRF live in the same-origin fetch layer) and translates
 * results/errors into the SDK's typed `SaveResultPayload` codes. The game iframe
 * only ever sees these codes — never HTTP status, tokens, or cookies.
 */
import type { HostSaveAdapter, SaveResultPayload } from '@vibeplay/sdk';
import type { ApiClient } from './api';
import { ApiClientError } from './api/errors';

function mapError(err: unknown): SaveResultPayload {
  if (err instanceof ApiClientError) {
    switch (err.code) {
      case 'UNAUTHORIZED':
        return { code: 'auth_required' };
      case 'PAYLOAD_TOO_LARGE':
        return { code: 'too_large' };
      case 'SAVE_INVALID':
      case 'VALIDATION_ERROR':
        return { code: 'invalid' };
      case 'RATE_LIMITED':
        return { code: 'rate_limited' };
      case 'SAVE_NOT_FOUND':
      case 'NOT_FOUND':
      case 'GAME_NOT_FOUND':
        return { code: 'not_found' };
      default:
        break;
    }
    // Fall back to HTTP status if the code is unrecognized.
    if (err.status === 401) return { code: 'auth_required' };
    if (err.status === 413) return { code: 'too_large' };
    if (err.status === 422) return { code: 'invalid' };
    if (err.status === 429) return { code: 'rate_limited' };
    if (err.status === 404) return { code: 'not_found' };
  }
  return { code: 'error' };
}

export interface CloudSaveAdapterHooks {
  /** Fired after a successful load of an existing save (for analytics). */
  onLoaded?: () => void;
  /** Fired when a write fails because the session is no longer authenticated. */
  onAuthRequired?: () => void;
  /** Privacy-safe operation outcome. No save payload is included. */
  onResult?: (operation: 'get' | 'set', result: SaveResultPayload) => void;
}

export function createCloudSaveAdapter(
  api: ApiClient,
  gameId: string,
  hooks: CloudSaveAdapterHooks = {},
): HostSaveAdapter {
  return {
    async get() {
      try {
        const save = await api.getGameSave(gameId);
        if (!save) {
          const result = { code: 'not_found' } as const;
          hooks.onResult?.('get', result);
          return result;
        }
        hooks.onLoaded?.();
        const result = { code: 'ok', data: save.data, schemaVersion: save.schemaVersion } as const;
        hooks.onResult?.('get', { code: 'ok' });
        return result;
      } catch (err) {
        const result = mapError(err);
        hooks.onResult?.('get', result);
        return result;
      }
    },
    async set(data, schemaVersion) {
      try {
        await api.putGameSave(gameId, data, schemaVersion);
        const result = { code: 'ok' } as const;
        hooks.onResult?.('set', result);
        return result;
      } catch (err) {
        const mapped = mapError(err);
        if (mapped.code === 'auth_required') hooks.onAuthRequired?.();
        hooks.onResult?.('set', mapped);
        return mapped;
      }
    },
    async delete() {
      try {
        await api.deleteGameSave(gameId);
        return { code: 'ok' };
      } catch (err) {
        return mapError(err);
      }
    },
    async status() {
      try {
        const save = await api.getGameSave(gameId);
        return {
          code: 'ok',
          status: {
            available: true,
            loggedIn: true,
            hasSave: save !== null,
            sizeBytes: save?.sizeBytes,
            schemaVersion: save?.schemaVersion,
            updatedAt: save?.updatedAt,
          },
        };
      } catch (err) {
        const mapped = mapError(err);
        if (mapped.code === 'auth_required') {
          return { code: 'ok', status: { available: true, loggedIn: false, hasSave: false } };
        }
        return mapped;
      }
    },
  };
}
