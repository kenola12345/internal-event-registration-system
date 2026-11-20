import {
  createFeedbackSchema,
  eventIdParamSchema,
  feedbackIdParamSchema,
  feedbackVisibilitySchema,
  listFeedbacksQuerySchema,
  updateFeedbackSchema,
} from "@template/shared";
import { Router } from "express";

import * as feedbacks from "../controllers/feedbacks.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";
import { validate } from "../middleware/validate.js";

// フィードバック(F1〜F4) のルート(routes/index.ts への登録は済み)
export const feedbacksRouter = Router();

feedbacksRouter.get(
  "/events/:eventId/feedbacks",
  requireAuth,
  validate({ params: eventIdParamSchema, query: listFeedbacksQuerySchema }),
  feedbacks.list,
);

feedbacksRouter.post(
  "/events/:eventId/feedback",
  requireAuth,
  validate({ params: eventIdParamSchema, body: createFeedbackSchema }),
  feedbacks.create,
);

feedbacksRouter.patch(
  "/events/:eventId/feedback",
  requireAuth,
  validate({ params: eventIdParamSchema, body: updateFeedbackSchema }),
  feedbacks.update,
);

feedbacksRouter.patch(
  "/feedbacks/:feedbackId/visibility",
  requireAuth,
  requireRole("ADMIN"),
  validate({ params: feedbackIdParamSchema, body: feedbackVisibilitySchema }),
  feedbacks.setVisibility,
);
