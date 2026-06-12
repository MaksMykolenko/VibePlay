import type { GameVersionStatus } from './enums.js';

/**
 * Moderation state machine for GameVersion (spec §23).
 *
 * UPLOADING → QUARANTINED → VALIDATING → READY_FOR_REVIEW → APPROVED → PUBLISHED → ARCHIVED
 * VALIDATING → SCAN_FAILED
 * READY_FOR_REVIEW → REJECTED
 *
 * Any transition not listed here must be rejected with 409 Conflict.
 */
const TRANSITIONS: Record<GameVersionStatus, readonly GameVersionStatus[]> = {
  UPLOADING: ['QUARANTINED'],
  QUARANTINED: ['VALIDATING'],
  VALIDATING: ['READY_FOR_REVIEW', 'SCAN_FAILED'],
  SCAN_FAILED: [],
  READY_FOR_REVIEW: ['APPROVED', 'REJECTED'],
  APPROVED: ['PUBLISHED'],
  REJECTED: [],
  PUBLISHED: ['ARCHIVED'],
  ARCHIVED: [],
};

export function canTransition(from: GameVersionStatus, to: GameVersionStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: GameVersionStatus, to: GameVersionStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

export class InvalidTransitionError extends Error {
  readonly from: GameVersionStatus;
  readonly to: GameVersionStatus;
  constructor(from: GameVersionStatus, to: GameVersionStatus) {
    super(`Invalid game version transition: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
    this.from = from;
    this.to = to;
  }
}

/** Statuses in which a version is visible in the admin moderation queue. */
export const MODERATION_QUEUE_STATUSES: readonly GameVersionStatus[] = [
  'READY_FOR_REVIEW',
  'VALIDATING',
  'SCAN_FAILED',
];

/** A version may be approved only from READY_FOR_REVIEW (never from VALIDATING/SCAN_FAILED). */
export function isApprovable(status: GameVersionStatus): boolean {
  return status === 'READY_FOR_REVIEW';
}
