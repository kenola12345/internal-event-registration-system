import {
  eventIdParamSchema,
  markAttendanceSchema,
  registrationIdParamSchema,
} from "@template/shared";
import type { RequestHandler } from "express";

import { currentUser } from "../middleware/auth.js";
import { getValidated } from "../middleware/validate.js";
import * as attendance from "../services/attendance.service.js";
import * as registrations from "../services/registrations.service.js";

// 参加登録・出席(R1〜R5)のコントローラ。HTTP の入出力だけを扱い、判定はサービスに任せる。

/** R1 参加登録。201 で登録 ID と登録後のイベント詳細を返す */
export const register: RequestHandler = async (req, res) => {
  const { eventId } = getValidated(req, "params", eventIdParamSchema);
  const result = await registrations.register(currentUser(req), eventId);
  res.status(201).json({ data: result });
};

/** R2 本人キャンセル。204 */
export const cancelOwn: RequestHandler = async (req, res) => {
  const { eventId } = getValidated(req, "params", eventIdParamSchema);
  await registrations.cancelOwnRegistration(currentUser(req), eventId);
  res.status(204).end();
};

/** R3 参加者・出席・待機一覧 */
export const list: RequestHandler = async (req, res) => {
  const { eventId } = getValidated(req, "params", eventIdParamSchema);
  const result = await registrations.listEventRegistrations(currentUser(req), eventId);
  res.json({ data: result });
};

/** R4 admin の強制キャンセル。204 */
export const forceCancel: RequestHandler = async (req, res) => {
  const { eventId, registrationId } = getValidated(req, "params", registrationIdParamSchema);
  await registrations.forceCancelRegistration(eventId, registrationId);
  res.status(204).end();
};

/** R5 出席マーク */
export const markAttendance: RequestHandler = async (req, res) => {
  const { eventId, registrationId } = getValidated(req, "params", registrationIdParamSchema);
  const input = getValidated(req, "body", markAttendanceSchema);
  const result = await attendance.markAttendance(currentUser(req), eventId, registrationId, input);
  res.json({ data: result });
};
