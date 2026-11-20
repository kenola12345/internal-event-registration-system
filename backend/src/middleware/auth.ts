import type { RequestHandler } from "express";

import { AppError } from "../errors/AppError.js";
import { verifyToken } from "../lib/jwt.js";

export const AUTH_COOKIE = "token";

/** Requires a valid login cookie. Puts { id, role } on req.user, otherwise 401. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = (req.cookies as Record<string, unknown> | undefined)?.[AUTH_COOKIE];
  const payload = typeof token === "string" ? verifyToken(token) : null;
  if (!payload) throw new AppError("UNAUTHENTICATED", "Please log in");
  req.user = { id: payload.userId, role: payload.role };
  next();
};
