import type { UserRole } from "@template/shared";
import type { RequestHandler } from "express";

import { AppError } from "../errors/AppError.js";

/** Use AFTER requireAuth: `router.get("/admin/x", requireAuth, requireRole("ADMIN"), ...)`. */
export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw new AppError("UNAUTHENTICATED", "Please log in");
    if (!roles.includes(req.user.role)) {
      throw new AppError("FORBIDDEN", "You don't have permission to do this");
    }
    next();
  };
}
