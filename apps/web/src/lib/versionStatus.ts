import type { GameVersionStatus } from '@vibeplay/shared';

/**
 * Honest creator-facing status copy (spec §38). Every label corresponds to a
 * real pipeline state — there is no fake progress.
 */
export const VERSION_STATUS_LABELS: Record<GameVersionStatus, string> = {
  UPLOADING: 'Uploading',
  QUARANTINED: 'Validating archive',
  VALIDATING: 'Scanning for malware',
  SCAN_FAILED: 'Rejected by validation',
  READY_FOR_REVIEW: 'Ready for review',
  APPROVED: 'Under review',
  REJECTED: 'Rejected',
  PUBLISHED: 'Published',
  ARCHIVED: 'Archived (replaced by a newer version)',
};

export function versionStatusLabel(status: string): string {
  return VERSION_STATUS_LABELS[status as GameVersionStatus] ?? status;
}
