// The API response contract. Every endpoint returns either { data } or { error }.

export const ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  INVALID_CREDENTIALS: 401,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  ROUTE_NOT_FOUND: 404,
  EMAIL_TAKEN: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

/** One invalid field, shown next to the matching form input. */
export type FieldError = { field: string; message: string };

export type ApiSuccess<T> = { data: T };

export type ApiErrorBody = {
  error: { code: ErrorCode; message: string; details?: FieldError[] };
};
