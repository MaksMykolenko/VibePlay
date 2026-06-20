/** Stable machine-readable API error codes. */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'EMAIL_NOT_VERIFIED',
  'ACCOUNT_SUSPENDED',
  'ACCOUNT_BANNED',
  'INVALID_CREDENTIALS',
  'INVITE_REQUIRED',
  'INVITE_INVALID',
  'EMAIL_TAKEN',
  'USERNAME_TAKEN',
  'TOKEN_INVALID',
  'TOKEN_EXPIRED',
  'CSRF_FAILED',
  'NOT_FOUND',
  'USER_NOT_FOUND',
  'GAME_NOT_FOUND',
  'VERSION_NOT_FOUND',
  'COMMENT_NOT_FOUND',
  'REPORT_NOT_FOUND',
  'UPLOAD_NOT_FOUND',
  'AVATAR_NOT_FOUND',
  'COVER_NOT_FOUND',
  'CONFLICT',
  'INVALID_STATE_TRANSITION',
  'ALREADY_COMPLETED',
  'OWNERSHIP_REQUIRED',
  'SELF_MODERATION_FORBIDDEN',
  'PAYLOAD_TOO_LARGE',
  'PLAN_LIMIT_REACHED',
  'RATE_LIMITED',
  'NOT_AVAILABLE_IN_BETA',
  'NOT_AVAILABLE_IN_DEMO',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    requestId?: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(statusCode: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const errors = {
  validation: (details?: unknown) =>
    new ApiError(422, 'VALIDATION_ERROR', 'Request validation failed', details),
  unauthorized: (message = 'Authentication required') => new ApiError(401, 'UNAUTHORIZED', message),
  forbidden: (message = 'You do not have permission to perform this action') =>
    new ApiError(403, 'FORBIDDEN', message),
  emailNotVerified: () =>
    new ApiError(403, 'EMAIL_NOT_VERIFIED', 'Please verify your email address first'),
  accountSuspended: () => new ApiError(403, 'ACCOUNT_SUSPENDED', 'This account is suspended'),
  accountBanned: () => new ApiError(403, 'ACCOUNT_BANNED', 'This account is banned'),
  invalidCredentials: () => new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password'),
  notFound: (code: ErrorCode = 'NOT_FOUND', message = 'Resource not found') =>
    new ApiError(404, code, message),
  conflict: (message = 'Conflict with current state', code: ErrorCode = 'CONFLICT') =>
    new ApiError(409, code, message),
  invalidTransition: (from: string, to: string) =>
    new ApiError(409, 'INVALID_STATE_TRANSITION', `Cannot transition from ${from} to ${to}`),
  tooLarge: (message = 'Payload too large') => new ApiError(413, 'PAYLOAD_TOO_LARGE', message),
  planLimit: (message: string, details?: unknown) =>
    new ApiError(409, 'PLAN_LIMIT_REACHED', message, details),
  rateLimited: () => new ApiError(429, 'RATE_LIMITED', 'Too many requests, slow down'),
  internal: () => new ApiError(500, 'INTERNAL_ERROR', 'Internal server error'),
};
