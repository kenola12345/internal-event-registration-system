import { loginSchema } from "@template/shared";
import type { RequestHandler, Response } from "express";

import { env } from "../config/env.js";
import { signToken, TOKEN_TTL_SECONDS } from "../lib/jwt.js";
import { AUTH_COOKIE } from "../middleware/auth.js";
import { getValidated } from "../middleware/validate.js";
import * as auth from "../services/auth.service.js";

// Controller layer: HTTP in, HTTP out. Read validated input, call a service, send the response.
// Express 5 forwards rejected promises to the error handler, so no try/catch is needed.

/**
 * The token lives in an httpOnly cookie so JavaScript (and therefore XSS) can't read it.
 * SameSite=Lax blocks cross-site POSTs (CSRF); Secure is required once you serve over HTTPS.
 */
function setAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    maxAge: TOKEN_TTL_SECONDS * 1000,
    path: "/",
  });
}

export const login: RequestHandler = async (req, res) => {
  const input = getValidated(req, "body", loginSchema);
  const user = await auth.login(input);
  setAuthCookie(res, signToken({ userId: user.id, role: user.role }));
  res.json({ data: user });
};

export const logout: RequestHandler = (_req, res) => {
  res.clearCookie(AUTH_COOKIE, { path: "/" });
  res.status(204).end();
};

/** Who am I? The frontend calls this on load to learn whether the visitor is logged in. */
export const me: RequestHandler = async (req, res) => {
  // requireAuth runs first on this route, so req.user is always set.
  const user = await auth.getUserById(req.user?.id ?? "");
  res.json({ data: user });
};
