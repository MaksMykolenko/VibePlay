import type { ErrorCode } from '@vibeplay/shared';

export class ApiClientError extends Error {
  readonly code: ErrorCode | 'NETWORK_ERROR';
  readonly status: number;
  readonly requestId?: string;
  readonly details?: unknown;

  constructor(
    code: ErrorCode | 'NETWORK_ERROR',
    message: string,
    status: number,
    requestId?: string,
    details?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
    this.details = details;
  }
}

export function isApiError(
  err: unknown,
  code?: ErrorCode | 'NETWORK_ERROR',
): err is ApiClientError {
  if (!(err instanceof ApiClientError)) return false;
  return code === undefined || err.code === code;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiClientError) {
    if (err.code === 'NETWORK_ERROR') return 'Network error — check your connection and try again.';
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}
