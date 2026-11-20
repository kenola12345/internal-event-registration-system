import { listTagsQuerySchema } from "@template/shared";
import { Router } from "express";

import * as tags from "../controllers/tags.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

// タグ(T1) のルート(routes/index.ts への登録は済み)
export const tagsRouter = Router();

tagsRouter.get("/tags", requireAuth, validate({ query: listTagsQuerySchema }), tags.list);
