import { loginSchema, signupSchema } from "@template/shared";
import { Router } from "express";

import * as auth from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { authRateLimit } from "../middleware/rateLimits.js";
import { validate } from "../middleware/validate.js";

// Routes layer: URL + middleware (rate limit, validation, auth...) -> controller. No logic here.
export const authRouter = Router();

authRouter.post("/auth/signup", authRateLimit, validate({ body: signupSchema }), auth.signup);
authRouter.post("/auth/login", authRateLimit, validate({ body: loginSchema }), auth.login);
authRouter.post("/auth/logout", auth.logout);
authRouter.get("/auth/me", requireAuth, auth.me);
