import { describe, expect, it } from 'vitest';
import {
  GAME_VERSION_STATUSES,
  InvalidTransitionError,
  assertTransition,
  canTransition,
  isApprovable,
} from './index.js';

const allowed = new Set([
  'UPLOADING:QUARANTINED',
  'QUARANTINED:VALIDATING',
  'VALIDATING:READY_FOR_REVIEW',
  'VALIDATING:SCAN_FAILED',
  'READY_FOR_REVIEW:APPROVED',
  'READY_FOR_REVIEW:REJECTED',
  'APPROVED:PUBLISHED',
  'PUBLISHED:ARCHIVED',
]);

describe('game version state machine', () => {
  it('allows exactly the documented transitions', () => {
    for (const from of GAME_VERSION_STATUSES) {
      for (const to of GAME_VERSION_STATUSES) {
        expect(canTransition(from, to), `${from} -> ${to}`).toBe(allowed.has(`${from}:${to}`));
      }
    }
  });

  it('throws a typed error for an invalid transition', () => {
    expect(() => assertTransition('READY_FOR_REVIEW', 'PUBLISHED')).toThrow(InvalidTransitionError);
  });

  it('only marks READY_FOR_REVIEW as approvable', () => {
    for (const status of GAME_VERSION_STATUSES) {
      expect(isApprovable(status)).toBe(status === 'READY_FOR_REVIEW');
    }
  });
});
