import {
  createFeedbackSchema,
  eventIdParamSchema,
  feedbackIdParamSchema,
  feedbackVisibilitySchema,
  listFeedbacksQuerySchema,
  updateFeedbackSchema,
} from "@template/shared";
import type { RequestHandler } from "express";

import { currentUser } from "../middleware/auth.js";
import { getValidated } from "../middleware/validate.js";
import * as feedbacks from "../services/feedbacks.service.js";

// フィードバック(F1〜F4)のコントローラ。検証済みの入力を読み、サービスを呼んで { data } を返す。

/** F1 レビュー一覧・平均評価 */
export const list: RequestHandler = async (req, res) => {
  const { eventId } = getValidated(req, "params", eventIdParamSchema);
  const query = getValidated(req, "query", listFeedbacksQuerySchema);
  const data = await feedbacks.listFeedbacks(eventId, query, currentUser(req));
  res.json({ data });
};

/** F2 投稿 */
export const create: RequestHandler = async (req, res) => {
  const { eventId } = getValidated(req, "params", eventIdParamSchema);
  const input = getValidated(req, "body", createFeedbackSchema);
  const data = await feedbacks.createFeedback(eventId, input, currentUser(req));
  res.status(201).json({ data });
};

/** F3 自分の投稿の編集 */
export const update: RequestHandler = async (req, res) => {
  const { eventId } = getValidated(req, "params", eventIdParamSchema);
  const input = getValidated(req, "body", updateFeedbackSchema);
  const data = await feedbacks.updateFeedback(eventId, input, currentUser(req));
  res.json({ data });
};

/** F4 非公開化・再公開(admin) */
export const setVisibility: RequestHandler = async (req, res) => {
  const { feedbackId } = getValidated(req, "params", feedbackIdParamSchema);
  const input = getValidated(req, "body", feedbackVisibilitySchema);
  const data = await feedbacks.setFeedbackVisibility(feedbackId, input, currentUser(req));
  res.json({ data });
};
