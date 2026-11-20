import type { EventRegistrations, RegisterResult } from "@template/shared";

import { AppError } from "../errors/AppError.js";
import { lockEvent } from "../lib/event-lock.js";
import { prisma } from "../lib/prisma.js";
import { isUniqueViolation } from "../lib/prisma-errors.js";
import { getEventDetail } from "./event-view.service.js";
import { type Actor, assertCanManageEvent } from "./policies/event-policy.js";
import { logPromotions, promoteWaiters } from "./waitlist-promotion.service.js";

// 参加登録(R1)・本人キャンセル(R2)・参加者一覧(R3)・強制キャンセル(R4)の業務ルール。

/** R1 ログインユーザー自身をイベントの参加確定者として登録し、登録後のイベント詳細を返す */
export async function register(actor: Actor, eventId: string): Promise<RegisterResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      // 空き 1 席への同時登録で定員を超えないよう、最初にイベント行をロックして直列化する(マニフェスト 3-6)
      const event = await lockEvent(tx, eventId);

      // 判定順はマニフェスト 3-3 / R1 のとおり: 主催者 → 締切・開始 → 登録済み/待機中 → 空き
      // 主催者は参加者とは別管理で、定員・登録者数に含めない(マニフェスト 3-3)
      if (event.organizerId === actor.id) {
        throw new AppError("ORGANIZER_CANNOT_REGISTER", "自分が主催するイベントには登録できません");
      }
      const now = new Date();
      // 登録締切の実効値は registrationDeadline ?? startsAt(マニフェスト 3-3)
      if (now >= event.startsAt || now >= (event.registrationDeadline ?? event.startsAt)) {
        throw new AppError("REGISTRATION_CLOSED", "登録の受付は終了しています");
      }
      // トランザクションは 1 接続なので、クエリは並列にせず順に実行する
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
      const registeredCount = await tx.registration.count({ where: { eventId } });
      if (registeredCount >= event.capacity) {
        throw new AppError("EVENT_FULL", "定員に達しています");
      }

      const created = await tx.registration.create({
        data: { eventId, userId: actor.id },
        select: { id: true },
      });
      // 更新直後の状態(myStatus・空き数・permissions)を返すため、同じ tx で詳細を組み立てる
      return { registrationId: created.id, event: await getEventDetail(actor, eventId, tx) };
    });
  } catch (error) {
    // 二重登録はアプリの判定と DB 一意制約の両方で防ぐ(マニフェスト 3-3)
    if (isUniqueViolation(error)) {
      throw new AppError("ALREADY_REGISTERED", "既に参加登録またはキャンセル待ち中です");
    }
    throw error;
  }
}

/** R2 ログインユーザー自身の参加登録をキャンセルし、開催前なら先頭の待機者を繰り上げる */
export async function cancelOwnRegistration(actor: Actor, eventId: string): Promise<void> {
  // 削除と繰り上げを 1 トランザクションにして、繰り上げの欠落・二重繰り上げを防ぐ(マニフェスト 3-6)
  const promotions = await prisma.$transaction(async (tx) => {
    const event = await lockEvent(tx, eventId);
    const registration = await tx.registration.findUnique({
      where: { eventId_userId: { eventId, userId: actor.id } },
      select: { id: true },
    });
    if (!registration) throw new AppError("NOT_FOUND", "参加登録が見つかりません");
    // キャンセル期限の実効値は cancelDeadline ?? startsAt。期限後は admin の強制キャンセルのみ(マニフェスト 3-3)
    if (new Date() >= (event.cancelDeadline ?? event.startsAt)) {
      throw new AppError("CANCEL_DEADLINE_PASSED", "キャンセル期限を過ぎています");
    }
    // キャンセルは参加履歴ではないため物理削除する(マニフェスト 3-3)
    await tx.registration.delete({ where: { id: registration.id } });
    return promoteWaiters(tx, event, {
      count: 1,
      trigger: "CANCELLATION",
      vacatedByUserId: actor.id,
    });
  });
  // ロールバックされた繰り上げをログに残さないよう、コミット後に出す(マニフェスト 3-8)
  logPromotions(promotions);
}

/** R3 出席管理画面用に、参加確定者・待機者(順位付き)・出席状態の集計を返す */
export async function listEventRegistrations(
  actor: Actor,
  eventId: string,
): Promise<EventRegistrations> {
  const event = await prisma.event.findFirst({
    where: { id: eventId, deletedAt: null },
    select: { organizerId: true },
  });
  if (!event) throw new AppError("NOT_FOUND", "イベントが見つかりません");
  // 主催者または admin のみ。イベント自体は公開されているので 403(マニフェスト 2.5)
  assertCanManageEvent(actor, event);

  const user = { select: { id: true, name: true } } as const;
  const [registrations, waitlist] = await Promise.all([
    // 登録順(同時刻は id で安定させる)。主催者は参加確定行を持たないので含まれない
    prisma.registration.findMany({
      where: { eventId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: { user },
    }),
    prisma.waitlistEntry.findMany({
      where: { eventId },
      orderBy: { position: "asc" },
      include: { user },
    }),
  ]);

  const summary = { present: 0, absent: 0, unmarked: 0 };
  for (const registration of registrations) {
    if (registration.attendance === "PRESENT") summary.present += 1;
    else if (registration.attendance === "ABSENT") summary.absent += 1;
    else summary.unmarked += 1;
  }

  return {
    registrations: registrations.map((registration) => ({
      id: registration.id,
      user: registration.user,
      attendance: registration.attendance,
      attendanceMarkedAt: registration.attendanceMarkedAt?.toISOString() ?? null,
      registeredAt: registration.createdAt.toISOString(),
    })),
    // position は振り直さないため、表示順位は並び順から 1 始まりで計算する(マニフェスト 3-6)
    waitlist: waitlist.map((entry, index) => ({
      id: entry.id,
      user: entry.user,
      rank: index + 1,
      joinedAt: entry.createdAt.toISOString(),
    })),
    summary,
  };
}

/** R4 admin が他人の参加登録を期限を無視して強制キャンセルし、開催前なら先頭の待機者を繰り上げる */
export async function forceCancelRegistration(
  eventId: string,
  registrationId: string,
): Promise<void> {
  const promotions = await prisma.$transaction(async (tx) => {
    const event = await lockEvent(tx, eventId);
    // 別イベントの登録 ID を指定された場合も、存在しない扱いで 404(マニフェスト R4)
    const registration = await tx.registration.findFirst({
      where: { id: registrationId, eventId },
      select: { id: true, userId: true },
    });
    if (!registration) throw new AppError("NOT_FOUND", "参加登録が見つかりません");
    // admin の強制キャンセルはキャンセル期限を無視する(マニフェスト 3-3)
    await tx.registration.delete({ where: { id: registration.id } });
    // 空きを作ったのはキャンセルされた参加者。開催開始後は promoteWaiters 側で繰り上げない(マニフェスト 3-6)
    return promoteWaiters(tx, event, {
      count: 1,
      trigger: "ADMIN_CANCELLATION",
      vacatedByUserId: registration.userId,
    });
  });
  // ロールバックされた繰り上げをログに残さないよう、コミット後に出す(マニフェスト 3-8)
  logPromotions(promotions);
}
