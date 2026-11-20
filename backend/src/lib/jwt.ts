import { USER_ROLES, type UserRole } from "@template/shared";
import jwt from "jsonwebtoken";
import { z } from "zod";

import { env } from "../config/env.js";

/** Token lifetime. Keep in sync with the cookie maxAge in auth.controller.ts. */
export const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

const payloadSchema = z.object({ sub: z.string(), role: z.enum(USER_ROLES) });

export type TokenPayload = { userId: string; role: UserRole };

/** Signs a login token. Only the id and role go in; the token is readable by anyone holding it. */
export function signToken({ userId, role }: TokenPayload): string {
  return jwt.sign({ role }, env.JWT_SECRET, {
    subject: userId,
    expiresIn: TOKEN_TTL_SECONDS,
    algorithm: "HS256",
  });
}

/** Returns the payload, or null for any invalid/expired/tampered token. */
export function verifyToken(token: string): TokenPayload | null {
  try {
    // Pin the algorithm so a forged `alg: none` token is rejected.
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
    const parsed = payloadSchema.safeParse(decoded);
    return parsed.success ? { userId: parsed.data.sub, role: parsed.data.role } : null;
  } catch {
    return null;
  }
}
