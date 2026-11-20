import type { AttendanceResult, MarkAttendanceInput } from "@template/shared";

import { AppError } from "../errors/AppError.js";
import { prisma } from "../lib/prisma.js";
import { type Actor, assertCanManageEvent } from "./policies/event-policy.js";

// 出席マーク(R5)の業務ルール。

/** R5 参加確定者 1 人の出席状態を設定する(PRESENT / ABSENT / UNMARKED) */
export async function markAttendance(
  actor: Actor,
  eventId: string,
  registrationId: string,
  input: MarkAttendanceInput,
): Promise<AttendanceResult> {
  // 判定順はマニフェスト R5 のとおり: イベント 404 → 権限 403 → 開催前 400 → 登録 404
  const event = await prisma.event.findFirst({
    where: { id: eventId, deletedAt: null },
    select: { organizerId: true, startsAt: true },
  });
  if (!event) throw new AppError("NOT_FOUND", "イベントが見つかりません");
  assertCanManageEvent(actor, event);
  const now = new Date();
  // 出席マークは開催開始日時以降のみ(マニフェスト 3-5)
  if (now < event.startsAt) {
    throw new AppError("EVENT_NOT_STARTED", "開催開始後に出席をマークできます");
  }
  // 別イベントの登録 ID を指定された場合も 404
  const registration = await prisma.registration.findFirst({
    where: { id: registrationId, eventId },
    select: { id: true },
  });
  if (!registration) throw new AppError("NOT_FOUND", "参加登録が見つかりません");

  // マークした日時と人を記録し、未マークに戻したら両方消す(マニフェスト 3-5)
  const isMarked = input.status !== "UNMARKED";
  const updated = await prisma.registration.update({
    where: { id: registration.id },
    data: {
      attendance: input.status,
      attendanceMarkedAt: isMarked ? now : null,
      attendanceMarkedById: isMarked ? actor.id : null,
    },
    select: { id: true, attendance: true, attendanceMarkedAt: true },
  });
  return {
    id: updated.id,
    attendance: updated.attendance,
    attendanceMarkedAt: updated.attendanceMarkedAt?.toISOString() ?? null,
  };
}
