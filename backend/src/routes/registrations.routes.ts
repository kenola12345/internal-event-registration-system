import {
  eventIdParamSchema,
  markAttendanceSchema,
  registrationIdParamSchema,
} from "@template/shared";
import { Router } from "express";

import * as registrations from "../controllers/registrations.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";
import { validate } from "../middleware/validate.js";

// 参加登録・出席(R1〜R5) のルート(routes/index.ts への登録は済み)
export const registrationsRouter = Router();

// 本人の登録は単数形のサブリソース。URL にユーザー ID を含めない(マニフェスト 2.5)
registrationsRouter.post(
  "/events/:eventId/registration",
  requireAuth,
  validate({ params: eventIdParamSchema }),
  registrations.register,
);
registrationsRouter.delete(
  "/events/:eventId/registration",
  requireAuth,
  validate({ params: eventIdParamSchema }),
  registrations.cancelOwn,
);
// 主催者 or admin の判定はサービスで event-policy を通す(マニフェスト 2.5)
registrationsRouter.get(
  "/events/:eventId/registrations",
  requireAuth,
  validate({ params: eventIdParamSchema }),
  registrations.list,
);
// 強制キャンセルは admin 専用(主催者でも member は不可。マニフェスト R4)
registrationsRouter.delete(
  "/events/:eventId/registrations/:registrationId",
  requireAuth,
  requireRole("ADMIN"),
  validate({ params: registrationIdParamSchema }),
  registrations.forceCancel,
);
registrationsRouter.put(
  "/events/:eventId/registrations/:registrationId/attendance",
  requireAuth,
  validate({ params: registrationIdParamSchema, body: markAttendanceSchema }),
  registrations.markAttendance,
);
