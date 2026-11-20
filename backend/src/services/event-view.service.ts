import type { Category as CategoryRow, Prisma, Registration } from "@prisma/client";
import type {
  Category,
  EventDetail,
  EventPermissions,
  EventSummary,
  MyEventStatus,
} from "@template/shared";

import { AppError } from "../errors/AppError.js";
import { prisma } from "../lib/prisma.js";
import { type Actor, canManageEvent } from "./policies/event-policy.js";

// イベントを API の形(EventSummary / EventDetail)に組み立てる共通サービス。
// 一覧・詳細・参加登録・待機・マイページの各 API が同じ形を返すよう、ここに集約する。

type Db = Prisma.TransactionClient;

/** EventSummary の組み立てに必要な関連(一覧・マイページのクエリでも使う) */
export const eventSummaryInclude = {
  category: true,
  organizer: { select: { id: true, name: true } },
  tags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
  _count: { select: { registrations: true, waitlistEntries: true } },
} satisfies Prisma.EventInclude;

export type EventSummaryRow = Prisma.EventGetPayload<{ include: typeof eventSummaryInclude }>;

/** カテゴリ行 → API の形 */
export function toCategory(row: CategoryRow): Category {
  return { id: row.id, name: row.name, sortOrder: row.sortOrder, isActive: row.isActive };
}

/**
 * 待機順位(1 始まり)を返す。position は振り直さない方式なので、
 * 自分より小さい position の件数 + 1 が表示上の順位になる(マニフェスト 3-6)。
 */
export async function waitlistRank(db: Db, eventId: string, position: number): Promise<number> {
  const ahead = await db.waitlistEntry.count({ where: { eventId, position: { lt: position } } });
  return ahead + 1;
}

/** 閲覧者と各イベントの関係(主催・参加確定・待機中・なし)をまとめて求める */
async function loadMyStatuses(
  db: Db,
  actor: Actor,
  rows: { id: string; organizerId: string }[],
): Promise<Map<string, MyEventStatus>> {
  const eventIds = rows.map((row) => row.id);
  const [registrations, waitlistEntries] = await Promise.all([
    db.registration.findMany({
      where: { userId: actor.id, eventId: { in: eventIds } },
      select: { eventId: true },
    }),
    db.waitlistEntry.findMany({
      where: { userId: actor.id, eventId: { in: eventIds } },
      select: { eventId: true, position: true },
    }),
  ]);
  const registered = new Set(registrations.map((r) => r.eventId));
  const ranks = new Map<string, number>();
  for (const entry of waitlistEntries) {
    ranks.set(entry.eventId, await waitlistRank(db, entry.eventId, entry.position));
  }

  const statuses = new Map<string, MyEventStatus>();
  for (const row of rows) {
    const rank = ranks.get(row.id);
    if (row.organizerId === actor.id) statuses.set(row.id, { kind: "ORGANIZER" });
    else if (registered.has(row.id)) statuses.set(row.id, { kind: "REGISTERED" });
    else if (rank !== undefined) statuses.set(row.id, { kind: "WAITLISTED", rank });
    else statuses.set(row.id, { kind: "NONE" });
  }
  return statuses;
}

function toSummary(row: EventSummaryRow, myStatus: MyEventStatus): EventSummary {
  // 主催者は参加者とは別管理なので、登録者数・空き数に含まれない(マニフェスト 3-3)
  const registeredCount = row._count.registrations;
  return {
    id: row.id,
    title: row.title,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    location: row.location,
    capacity: row.capacity,
    category: toCategory(row.category),
    tags: row.tags.map((eventTag) => eventTag.tag.name),
    organizer: row.organizer,
    registeredCount,
    remainingSeats: Math.max(row.capacity - registeredCount, 0),
    waitlistCount: row._count.waitlistEntries,
    myStatus,
  };
}

/** 一覧・マイページ用。`eventSummaryInclude` で取得した行を閲覧者から見た EventSummary にする */
export async function toEventSummaries(
  actor: Actor,
  rows: EventSummaryRow[],
  db: Db = prisma,
): Promise<EventSummary[]> {
  const statuses = await loadMyStatuses(db, actor, rows);
  return rows.map((row) => toSummary(row, statuses.get(row.id) ?? { kind: "NONE" }));
}

type PermissionInput = {
  actor: Actor;
  event: {
    organizerId: string;
    capacity: number;
    startsAt: Date;
    endsAt: Date;
    registrationDeadline: Date | null;
    cancelDeadline: Date | null;
  };
  registeredCount: number;
  myStatus: MyEventStatus;
  myRegistration: Pick<Registration, "attendance"> | undefined;
  hasFeedback: boolean;
  now: Date;
};

/**
 * 画面のボタン制御用の permissions を計算する(マニフェスト E2 の条件どおり)。
 * 表示専用で、各 API はサーバー側で同じ条件を必ず再判定する。
 */
export function computePermissions(input: PermissionInput): EventPermissions {
  const { actor, event, registeredCount, myStatus, myRegistration, hasFeedback, now } = input;
  const isOrganizer = event.organizerId === actor.id;
  const canManage = canManageEvent(actor, event);
  const hasStarted = now >= event.startsAt;
  const hasEnded = now >= event.endsAt;
  // 締切・期限が未設定なら開催開始まで(マニフェスト 3-3)
  const isRegistrationOpen = !hasStarted && now < (event.registrationDeadline ?? event.startsAt);
  const canApply = !isOrganizer && myStatus.kind === "NONE" && isRegistrationOpen;
  const hasSeat = registeredCount < event.capacity;
  const isPresent = myRegistration?.attendance === "PRESENT";

  return {
    canEdit: canManage,
    canManageAttendance: canManage,
    // 出席マークは開催開始日時以降のみ(マニフェスト 3-5)
    canMarkAttendance: canManage && hasStarted,
    canRegister: canApply && hasSeat,
    canJoinWaitlist: canApply && !hasSeat,
    canCancel: myStatus.kind === "REGISTERED" && now < (event.cancelDeadline ?? event.startsAt),
    canLeaveWaitlist: myStatus.kind === "WAITLISTED",
    // フィードバックは開催終了後・出席済み・主催者でない・未投稿のときだけ(マニフェスト 3-7)
    canPostFeedback: !isOrganizer && isPresent && hasEnded && !hasFeedback,
    canEditFeedback: hasFeedback && isPresent,
  };
}

/** 平均評価を小数第 1 位に丸める。0 件なら null */
function roundAverage(average: number | null): number | null {
  return average === null ? null : Math.round(average * 10) / 10;
}

/**
 * E2 イベント詳細を閲覧者から見た形で返す。存在しない・論理削除済みなら NOT_FOUND。
 * トランザクション内で呼ぶ場合は tx を渡す(更新直後の状態を返すため)。
 */
export async function getEventDetail(
  actor: Actor,
  eventId: string,
  db: Db = prisma,
): Promise<EventDetail> {
  const row = await db.event.findFirst({
    where: { id: eventId, deletedAt: null },
    include: {
      ...eventSummaryInclude,
      registrations: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: { user: { select: { id: true, name: true } } },
      },
    },
  });
  if (!row) throw new AppError("NOT_FOUND", "イベントが見つかりません");

  const [statuses, rating, myFeedback] = await Promise.all([
    loadMyStatuses(db, actor, [row]),
    // 非公開レビューは平均・件数から除外する(マニフェスト 3-7)
    db.feedback.aggregate({
      where: { eventId, isHidden: false },
      _avg: { rating: true },
      _count: true,
    }),
    db.feedback.findUnique({
      where: { eventId_userId: { eventId, userId: actor.id } },
      select: { id: true },
    }),
  ]);
  const myStatus = statuses.get(row.id) ?? { kind: "NONE" };
  const summary = toSummary(row, myStatus);

  return {
    ...summary,
    description: row.description,
    registrationDeadline: row.registrationDeadline?.toISOString() ?? null,
    cancelDeadline: row.cancelDeadline?.toISOString() ?? null,
    scheduleChangedAt: row.scheduleChangedAt?.toISOString() ?? null,
    participants: row.registrations.map((registration) => registration.user),
    rating: { average: roundAverage(rating._avg.rating), count: rating._count },
    permissions: computePermissions({
      actor,
      event: row,
      registeredCount: summary.registeredCount,
      myStatus,
      myRegistration: row.registrations.find((registration) => registration.userId === actor.id),
      hasFeedback: myFeedback !== null,
      now: new Date(),
    }),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
