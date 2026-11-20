import type { RequestHandler } from "express";

import { currentUser } from "../middleware/auth.js";
import * as me from "../services/me.service.js";

// マイページ(M1・M2)のコントローラ。対象は常にログインユーザー本人なので入力パラメータは無い。

/** M1 GET /api/me/events */
export const listMyEvents: RequestHandler = async (req, res) => {
  res.json({ data: await me.getMyEvents(currentUser(req)) });
};

/** M2 GET /api/me/stats */
export const getMyStats: RequestHandler = async (req, res) => {
  res.json({ data: await me.getMyStats(currentUser(req)) });
};
