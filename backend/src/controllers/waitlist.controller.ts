import { eventIdParamSchema } from "@template/shared";
import type { RequestHandler } from "express";

import { currentUser } from "../middleware/auth.js";
import { getValidated } from "../middleware/validate.js";
import * as waitlist from "../services/waitlist.service.js";

// キャンセル待ち(W1・W2)のコントローラ。HTTP の入出力だけを扱い、判定はサービスに任せる。

/** W1 キャンセル待ち登録。登録後のイベント詳細を 201 で返す */
export const join: RequestHandler = async (req, res) => {
  const { eventId } = getValidated(req, "params", eventIdParamSchema);
  const result = await waitlist.joinWaitlist(currentUser(req), eventId);
  res.status(201).json({ data: result });
};

/** W2 キャンセル待ち解除。ボディなしの 204 を返す */
export const leave: RequestHandler = async (req, res) => {
  const { eventId } = getValidated(req, "params", eventIdParamSchema);
  await waitlist.leaveWaitlist(currentUser(req), eventId);
  res.status(204).end();
};
