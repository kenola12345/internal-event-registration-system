import { eventIdParamSchema } from "@template/shared";
import { Router } from "express";

import * as waitlist from "../controllers/waitlist.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

// キャンセル待ち(W1〜W2) のルート。対象は常にログインユーザー自身なので URL にユーザー ID を含めない(マニフェスト 2.5)
export const waitlistRouter = Router();

waitlistRouter.post(
  "/events/:eventId/waitlist",
  requireAuth,
  validate({ params: eventIdParamSchema }),
  waitlist.join,
);
waitlistRouter.delete(
  "/events/:eventId/waitlist",
  requireAuth,
  validate({ params: eventIdParamSchema }),
  waitlist.leave,
);
