import {
  createEventSchema,
  eventIdParamSchema,
  listEventsQuerySchema,
  updateEventSchema,
} from "@template/shared";
import type { RequestHandler } from "express";

import { currentUser } from "../middleware/auth.js";
import { getValidated } from "../middleware/validate.js";
import * as events from "../services/events.service.js";

// イベント(E1〜E5)のコントローラ。HTTP の入出力だけを扱い、業務ルールはサービスに任せる。

/** E1 イベント一覧 */
export const list: RequestHandler = async (req, res) => {
  const query = getValidated(req, "query", listEventsQuerySchema);
  res.json({ data: await events.listEvents(currentUser(req), query) });
};

/** E2 イベント詳細 */
export const get: RequestHandler = async (req, res) => {
  const { eventId } = getValidated(req, "params", eventIdParamSchema);
  res.json({ data: await events.getEvent(currentUser(req), eventId) });
};

/** E3 イベント作成 */
export const create: RequestHandler = async (req, res) => {
  const input = getValidated(req, "body", createEventSchema);
  res.status(201).json({ data: await events.createEvent(currentUser(req), input) });
};

/** E4 イベント編集。警告を返すため data は { event, warnings } の形(マニフェスト E4) */
export const update: RequestHandler = async (req, res) => {
  const { eventId } = getValidated(req, "params", eventIdParamSchema);
  const input = getValidated(req, "body", updateEventSchema);
  res.json({ data: await events.updateEvent(currentUser(req), eventId, input) });
};

/** E5 イベント論理削除 */
export const remove: RequestHandler = async (req, res) => {
  const { eventId } = getValidated(req, "params", eventIdParamSchema);
  await events.deleteEvent(currentUser(req), eventId);
  res.status(204).end();
};
