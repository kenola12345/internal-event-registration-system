import { ERROR_STATUS, type ErrorCode, type FieldError } from "@template/shared";

/**
 * An expected failure (not found, invalid input...). Throw it from services;
 * the error handler turns it into the standard { error } response.
 * The HTTP status comes from the code, so callers never pick one.
 */
export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: FieldError[],
  ) {
    super(message);
    this.name = "AppError";
    this.status = ERROR_STATUS[code];
  }
}
