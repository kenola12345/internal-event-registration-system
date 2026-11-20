import { Router } from "express";

import * as me from "../controllers/me.controller.js";
import { requireAuth } from "../middleware/auth.js";

// マイページ(M1〜M2) のルート。URL にユーザー ID を含めず、常にログインユーザーを対象にする(マニフェスト 2 章)
export const meRouter = Router();

meRouter.get("/me/events", requireAuth, me.listMyEvents);
meRouter.get("/me/stats", requireAuth, me.getMyStats);
