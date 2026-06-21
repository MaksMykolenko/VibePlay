/**
 * Cloud-save validation primitives (spec Phase 1). Shared by the API (to guard
 * writes) and by tests. Kept framework-free so both sides agree on the rules.
 *
 * A cloud save is ONLY game state expressed as JSON. It is never executed and
 * never served as HTML, so we do NOT inspect string *content* (a save legitimately
 * may contain strings that look like code). What we DO enforce:
 *   - a hard byte cap on the serialized JSON;
 *   - a maximum nesting depth (defends against pathological/stack-abusing input);
 *   - JSON-representable values only (no functions/bigint/NaN/Infinity);
 *   - no prototype-pollution keys (__proto__, prototype, constructor).
 */
import { z } from 'zod';

/** Max serialized JSON size accepted for a single game save. */
export const GAME_SAVE_MAX_BYTES = 200 * 1024; // 200 KB
/** Max nesting depth allowed inside a save payload. */
export const GAME_SAVE_MAX_DEPTH = 24;
/** Upper bound for the game-defined save format version. */
export const GAME_SAVE_MAX_SCHEMA_VERSION = 1_000_000;

/** Keys that enable prototype pollution — never allowed anywhere in a save. */
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export type SaveDataInvalidReason =
  | 'not_object'
  | 'too_deep'
  | 'forbidden_key'
  | 'invalid_number'
  | 'unsupported_type';

export interface SaveDataInspection {
  ok: boolean;
  reason?: SaveDataInvalidReason;
  detail?: string;
}

/**
 * Structurally validate already-decoded JSON intended for a cloud save. This is
 * NOT a size check (the API caps serialized bytes separately). Returns the first
 * problem found, or `{ ok: true }`.
 */
export function inspectSaveData(
  value: unknown,
  maxDepth: number = GAME_SAVE_MAX_DEPTH,
): SaveDataInspection {
  // The root must be a structured value (object or array), not a bare scalar.
  if (value === null || typeof value !== 'object') {
    return { ok: false, reason: 'not_object', detail: 'Save data must be a JSON object or array' };
  }

  const walk = (v: unknown, depth: number): SaveDataInspection => {
    if (depth > maxDepth) {
      return { ok: false, reason: 'too_deep', detail: `Max nesting depth is ${maxDepth}` };
    }
    if (v === null) return { ok: true };
    switch (typeof v) {
      case 'string':
      case 'boolean':
        return { ok: true };
      case 'number':
        return Number.isFinite(v)
          ? { ok: true }
          : { ok: false, reason: 'invalid_number', detail: 'NaN/Infinity are not valid JSON' };
      case 'object': {
        if (Array.isArray(v)) {
          for (const item of v) {
            const r = walk(item, depth + 1);
            if (!r.ok) return r;
          }
          return { ok: true };
        }
        for (const key of Object.keys(v as Record<string, unknown>)) {
          if (FORBIDDEN_KEYS.has(key)) {
            return { ok: false, reason: 'forbidden_key', detail: `Key "${key}" is not allowed` };
          }
          const r = walk((v as Record<string, unknown>)[key], depth + 1);
          if (!r.ok) return r;
        }
        return { ok: true };
      }
      default:
        // undefined, function, bigint, symbol — not representable as JSON.
        return {
          ok: false,
          reason: 'unsupported_type',
          detail: `Unsupported value type: ${typeof v}`,
        };
    }
  };

  return walk(value, 1);
}

/**
 * Body schema for PUT /api/me/game-saves/:gameId. `data` is accepted as opaque
 * JSON here and validated structurally by `inspectSaveData` + the size cap in the
 * route, so the route can return precise typed errors (invalid vs too_large).
 */
export const gameSavePutSchema = z.object({
  data: z.unknown(),
  // Games may send a number or a numeric string; coerce to a non-negative int.
  schemaVersion: z.coerce.number().int().min(0).max(GAME_SAVE_MAX_SCHEMA_VERSION).optional(),
});

export type GameSavePutInput = z.infer<typeof gameSavePutSchema>;
