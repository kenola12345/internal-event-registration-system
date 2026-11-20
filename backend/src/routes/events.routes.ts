import {
  createEventSchema,
  eventIdParamSchema,
  listEventsQuerySchema,
  updateEventSchema,
} from "@template/shared";
import { Router } from "express";

import * as events from "../controllers/events.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

// イベント(E1〜E5) のルート。編集・削除の権限(主催者または admin)はサービスで判定する
export const eventsRouter = Router();

eventsRouter.get("/events", requireAuth, validate({ query: listEventsQuerySchema }), events.list);
eventsRouter.get(
  "/events/:eventId",
  requireAuth,
  validate({ params: eventIdParamSchema }),
  events.get,
);
eventsRouter.post("/events", requireAuth, validate({ body: createEventSchema }), events.create);
eventsRouter.patch(
  "/events/:eventId",
  requireAuth,
  validate({ params: eventIdParamSchema, body: updateEventSchema }),
  events.update,
);
eventsRouter.delete(
  "/events/:eventId",
  requireAuth,
  validate({ params: eventIdParamSchema }),
  events.remove,
);
