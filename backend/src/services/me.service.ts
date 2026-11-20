import type { AttendanceStatus, Category, MyEvents, MyStats } from "@template/shared";

import { prisma } from "../lib/prisma.js";
import { eventSummaryInclude, toCategory, toEventSummaries } from "./event-view.service.js";
import type { Actor } from "./policies/event-policy.js";

// マイページ(M1・M2)のサービス。対象は常にログインユーザー本人で、論理削除済みイベントは全区分から除外する。

/** 主催済みイベントの最大件数(マニフェスト M1) */
const ORGANIZED_PAST_LIMIT = 20;
/** 参加履歴の最大件数(マニフェスト M1) */
const HISTORY_LIMIT = 50;

/** M1 マイイベント: 主催予定・主催済み・参加予定・キャンセル待ち・参加履歴を返す */
export async function getMyEvents(actor: Actor): Promise<MyEvents> {
  const now = new Date();
  const upcoming = { deletedAt: null, startsAt: { gte: now } };
  const started = { deletedAt: null, startsAt: { lt: now } };

  const [organizingRows, organizedPastRows, registeredRows, waitlistedRows, historyRows] =
    await Promise.all([
      prisma.event.findMany({
        where: { ...upcoming, organizerId: actor.id },
        include: eventSummaryInclude,
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      }),
      prisma.event.findMany({
        where: { ...started, organizerId: actor.id },
        include: eventSummaryInclude,
        orderBy: [{ startsAt: "desc" }, { id: "asc" }],
        take: ORGANIZED_PAST_LIMIT,
      }),
      prisma.event.findMany({
        where: { ...upcoming, registrations: { some: { userId: actor.id } } },
        include: eventSummaryInclude,
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      }),
      prisma.event.findMany({
        where: { ...upcoming, waitlistEntries: { some: { userId: actor.id } } },
        include: eventSummaryInclude,
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      }),
      prisma.registration.findMany({
        where: { userId: actor.id, event: started },
        include: { event: { include: eventSummaryInclude } },
        orderBy: [{ event: { startsAt: "desc" } }, { id: "asc" }],
        take: HISTORY_LIMIT,
      }),
    ]);

  const historyEventIds = historyRows.map((registration) => registration.eventId);
  const [organizing, organizedPast, registered, waitlisted, historySummaries, feedbacks] =
    await Promise.all([
      toEventSummaries(actor, organizingRows),
      toEventSummaries(actor, organizedPastRows),
      toEventSummaries(actor, registeredRows),
      // 待機順位は toEventSummaries が myStatus.rank に入れる(マニフェスト 3-6)
      toEventSummaries(actor, waitlistedRows),
      toEventSummaries(
        actor,
        historyRows.map((registration) => registration.event),
      ),
      prisma.feedback.findMany({
        where: { userId: actor.id, eventId: { in: historyEventIds } },
        select: { eventId: true },
      }),
    ]);

  // 非公開にされたレビューも本人の投稿なので hasFeedback に含める(編集リンクの表示判定に使うため)
  const feedbackEventIds = new Set(feedbacks.map((feedback) => feedback.eventId));
  const history = historySummaries.map((summary, index) => ({
    ...summary,
    attendance: historyRows[index]?.attendance ?? "UNMARKED",
    hasFeedback: feedbackEventIds.has(summary.id),
  }));

  return { organizing, organizedPast, registered, waitlisted, history };
}

/** M2 統計: 累計参加数・出席状態別件数・出席率・カテゴリ別参加傾向を返す */
export async function getMyStats(actor: Actor): Promise<MyStats> {
  // 母集団は開催開始済み・未削除イベントの自分の参加確定行(マニフェスト 3-5)。
  // 主催者は参加登録を持たないので、主催イベントは自然に含まれない
  const rows = await prisma.registration.findMany({
    where: { userId: actor.id, event: { deletedAt: null, startsAt: { lte: new Date() } } },
    select: { attendance: true, event: { select: { category: true } } },
  });

  const counts: Record<AttendanceStatus, number> = { PRESENT: 0, ABSENT: 0, UNMARKED: 0 };
  const byCategoryId = new Map<string, { category: Category; count: number }>();
  for (const row of rows) {
    counts[row.attendance] += 1;
    // 累計参加数・カテゴリ別は欠席を数えない(PRESENT + UNMARKED。マニフェスト 3-5)
    if (row.attendance === "ABSENT") continue;
    const category = row.event.category;
    const entry = byCategoryId.get(category.id) ?? { category: toCategory(category), count: 0 };
    entry.count += 1;
    byCategoryId.set(category.id, entry);
  }

  // 出席率は未マークを分母から除外し、分母 0 なら null(マニフェスト 3-5)
  const denominator = counts.PRESENT + counts.ABSENT;
  const byCategory = [...byCategoryId.values()].sort(
    (a, b) => b.count - a.count || a.category.sortOrder - b.category.sortOrder,
  );

  return {
    participationCount: counts.PRESENT + counts.UNMARKED,
    presentCount: counts.PRESENT,
    absentCount: counts.ABSENT,
    unmarkedCount: counts.UNMARKED,
    attendanceRate: denominator === 0 ? null : counts.PRESENT / denominator,
    byCategory,
  };
}
