import type { JoinWaitlistResult } from "@template/shared";

import { AppError } from "../errors/AppError.js";
import { lockEvent } from "../lib/event-lock.js";
import { prisma } from "../lib/prisma.js";
import { isUniqueViolation } from "../lib/prisma-errors.js";
import { getEventDetail } from "./event-view.service.js";
import type { Actor } from "./policies/event-policy.js";

// キャンセル待ち(W1・W2)のビジネスルール。

/**
 * W1 ログインユーザーを満席のイベントのキャンセル待ちに登録し、登録後のイベント詳細を返す。
 * 空き判定と position 採番を参加登録・キャンセルと直列化するため、最初にイベント行をロックする(マニフェスト 3-6)。
 */
export async function joinWaitlist(actor: Actor, eventId: string): Promise<JoinWaitlistResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      const event = await lockEvent(tx, eventId);

      // 主催者は参加者とは別管理なので、自分のイベントには待機登録もできない(マニフェスト W1)
      if (event.organizerId === actor.id) {
        throw new AppError(
          "ORGANIZER_CANNOT_REGISTER",
          "自分が主催するイベントにはキャンセル待ち登録できません",
        );
      }

      // 判定はサーバー時刻。締切未設定なら開始日時が実効締切になる(マニフェスト W1)
      const now = new Date();
      const deadline = event.registrationDeadline ?? event.startsAt;
      if (now >= event.startsAt || now >= deadline) {
        throw new AppError("REGISTRATION_CLOSED", "登録の受付は終了しています");
      }

      // トランザクション(tx)は 1 本の接続を使うため、クエリは並列にせず順に実行する
      const registration = await tx.registration.findUnique({
        where: { eventId_userId: { eventId, userId: actor.id } },
        select: { id: true },
      });
      const waitlistEntry = await tx.waitlistEntry.findUnique({
        where: { eventId_userId: { eventId, userId: actor.id } },
        select: { id: true },
      });
      if (registration || waitlistEntry) {
        throw new AppError("ALREADY_REGISTERED", "既に参加登録またはキャンセル待ち中です");
      }

      // 空きがあるなら通常の参加登録をすべきなので、キャンセル待ちは満席時のみ(マニフェスト 3-6)
      const registeredCount = await tx.registration.count({ where: { eventId } });
      if (registeredCount < event.capacity) {
        throw new AppError(
          "SEATS_AVAILABLE",
          "空きがあるため、キャンセル待ちではなく参加登録してください",
        );
      }

      // position は「現在の最大 + 1」で採番し振り直さない。順位は position 昇順で数える(マニフェスト 3-6)
      const max = await tx.waitlistEntry.aggregate({
        where: { eventId },
        _max: { position: true },
      });
      const entry = await tx.waitlistEntry.create({
        data: { eventId, userId: actor.id, position: (max._max.position ?? 0) + 1 },
        select: { id: true },
      });

      return { waitlistEntryId: entry.id, event: await getEventDetail(actor, eventId, tx) };
    });
  } catch (error) {
    // 同時リクエストが事前チェックをすり抜けた場合も、一意制約で二重登録を防ぐ(マニフェスト 3-6)
    if (isUniqueViolation(error)) {
      throw new AppError("ALREADY_REGISTERED", "既に参加登録またはキャンセル待ち中です");
    }
    throw error;
  }
}

/**
 * W2 ログインユーザー自身のキャンセル待ちを解除する。待機行が無ければ 404。
 * 同時に起きた繰り上げと競合しないようイベント行をロックする(繰り上げ済みなら待機行は既に無く 404。マニフェスト W2)。
 */
export async function leaveWaitlist(actor: Actor, eventId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockEvent(tx, eventId);

    const entry = await tx.waitlistEntry.findUnique({
      where: { eventId_userId: { eventId, userId: actor.id } },
      select: { id: true },
    });
    if (!entry) throw new AppError("NOT_FOUND", "キャンセル待ちが見つかりません");

    // 他の待機者の position は振り直さない。後ろの人の順位は position 昇順で数え直すことで繰り上がる(マニフェスト 3-6)
    await tx.waitlistEntry.delete({ where: { id: entry.id } });
  });
}
