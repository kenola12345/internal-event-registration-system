import type { ApiErrorBody } from "@template/shared";
import type { ErrorRequestHandler, RequestHandler } from "express";

import { AppError } from "../errors/AppError.js";
import { logger } from "../lib/logger.js";

/** Unknown /api paths -> 404 in the standard error shape. */
export const apiNotFound: RequestHandler = () => {
  throw new AppError("ROUTE_NOT_FOUND", "This API endpoint doesn't exist");
};

/**
 * Last middleware. Converts every error into { error: { code, message, details? } }.
 * Unexpected errors are logged server-side only; the client gets a generic 500 (no internals leaked).
 */
export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  const known = toAppError(err);
  if (!known) {
    logger.error("unhandled error", {
      err,
      method: req.method,
      path: req.path,
      userId: req.user?.id,
    });
  }
  const { code, message, details, status } =
    known ?? new AppError("INTERNAL_ERROR", "Something went wrong");
  const body: ApiErrorBody = { error: { code, message, ...(details && { details }) } };
  res.status(status).json(body);
};

function toAppError(err: unknown): AppError | null {
  if (err instanceof AppError) return err;
  // express.json() failures (malformed JSON / body too large)
  if (typeof err === "object" && err !== null && "type" in err) {
    if (err.type === "entity.parse.failed") {
      return new AppError("VALIDATION_ERROR", "The request body isn't valid JSON");
    }
    if (err.type === "entity.too.large") {
      return new AppError("VALIDATION_ERROR", "The request body is too large");
    }
  }
  return null;
}
