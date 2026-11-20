import type { Event, Prisma, PromotionTrigger } from "@prisma/client";

import { logger } from "../lib/logger.js";

// キャンセル待ちの自動繰り上げ。本人キャンセル(R2)・強制キャンセル(R4)・定員増加(E4)が共通で使う。

/** 繰り上げ 1 件の結果(コミット後のログ出力に使う) */
export type Promotion = {
  eventId: string;
  promotedUserId: string;
  vacatedByUserId: string | null;
  trigger: PromotionTrigger;
  waitlistPosition: number;
};

type PromoteOptions = {
  /** 繰り上げる最大人数(空いた席の数) */
  count: number;
  trigger: PromotionTrigger;
  /** 空きを作った人。定員増加の場合は null */
  vacatedByUserId: string | null;
};

/**
 * 待機者を position の小さい順に最大 count 人、参加確定に繰り上げ、繰り上げ履歴を記録する。
 * 呼び出し側が lockEvent() でイベント行をロックしたトランザクションの中で呼ぶこと(二重繰り上げ防止)。
 * 開催開始後は繰り上げない(マニフェスト 3-6)。ログは出さないので、コミット後に logPromotions() を呼ぶ。
 */
export async function promoteWaiters(
  tx: Prisma.TransactionClient,
  event: Pick<Event, "id" | "startsAt">,
  { count, trigger, vacatedByUserId }: PromoteOptions,
): Promise<Promotion[]> {
  if (count <= 0 || new Date() >= event.startsAt) return [];

  const waiters = await tx.waitlistEntry.findMany({
    where: { eventId: event.id },
    orderBy: { position: "asc" },
    take: count,
  });

  const promotions: Promotion[] = [];
  for (const waiter of waiters) {
    await tx.registration.create({ data: { eventId: event.id, userId: waiter.userId } });
    await tx.waitlistEntry.delete({ where: { id: waiter.id } });
    // 将来の通知機能のため、いつ・誰が・誰の空きで繰り上がったかを残す(追記のみ)
    await tx.waitlistPromotion.create({
      data: {
        eventId: event.id,
        promotedUserId: waiter.userId,
        vacatedByUserId,
        trigger,
        waitlistPosition: waiter.position,
      },
    });
    promotions.push({
      eventId: event.id,
      promotedUserId: waiter.userId,
      vacatedByUserId,
      trigger,
      waitlistPosition: waiter.position,
    });
  }
  return promotions;
}

/**
 * 繰り上げを通知の代わりにログ出力する。ロールバックされた繰り上げをログに残さないよう、
 * 必ずトランザクションのコミット後に呼ぶ(マニフェスト 3-8)。
 */
export function logPromotions(promotions: Promotion[]): void {
  for (const promotion of promotions) {
    logger.info("waitlist promoted", promotion);
  }
}
