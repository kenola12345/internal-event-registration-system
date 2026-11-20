import type { ApiErrorBody } from "@template/shared";
import rateLimit from "express-rate-limit";

import { env } from "../config/env.js";

const body: ApiErrorBody = {
  error: { code: "RATE_LIMITED", message: "Too many attempts. Please try again later" },
};

/** Throttles login/signup per IP to slow down password guessing. Disabled in tests. */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => env.NODE_ENV === "test",
  handler: (_req, res) => {
    res.status(429).json(body);
  },
});
