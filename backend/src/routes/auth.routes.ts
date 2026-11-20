import { loginSchema } from "@template/shared";
import { Router } from "express";

import * as auth from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { authRateLimit } from "../middleware/rateLimits.js";
import { validate } from "../middleware/validate.js";

// Routes layer: URL + middleware (rate limit, validation, auth...) -> controller. No logic here.
export const authRouter = Router();

// サインアップは提供しない(ユーザーは seed で作成する仕様。マニフェスト 3-1)
authRouter.post("/auth/login", authRateLimit, validate({ body: loginSchema }), auth.login);
authRouter.post("/auth/logout", auth.logout);
authRouter.get("/auth/me", requireAuth, auth.me);
