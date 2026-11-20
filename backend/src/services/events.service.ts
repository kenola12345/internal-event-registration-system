import type { Event, Prisma } from "@prisma/client";
import {
  type CreateEventInput,
  type EventDetail,
  type EventSummary,
  type EventUpdateWarning,
  type FieldError,
  type ListEventsQuery,
  type Paginated,
  scheduleIssues,
  type UpdateEventInput,
  type UpdateEventResult,
} from "@template/shared";

import { AppError } from "../errors/AppError.js";
import { lockEvent } from "../lib/event-lock.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";
import { eventSummaryInclude, getEventDetail, toEventSummaries } from "./event-view.service.js";
import { type Actor, assertCanManageEvent } from "./policies/event-policy.js";
import { logPromotions, promoteWaiters, type Promotion } from "./waitlist-promotion.service.js";

// イベントの一覧・詳細・作成・編集・論理削除(E1〜E5)。

type Db = Prisma.TransactionClient;

/** 入力不正を 1 つの VALIDATION_ERROR にまとめて投げる(details が空なら何もしない) */
function throwIfIssues(details: FieldError[]): void {
  if (details.length > 0) {
    throw new AppError("VALIDATION_ERROR", "入力内容に誤りがあります", details);
  }
}

/** カテゴリが存在し有効か。無効化カテゴリは新規の紐付け先に選べない(マニフェスト 3-2・3-4) */
async function categoryIssue(db: Db, categoryId: string): Promise<FieldError | null> {
  const category = await db.category.findUnique({
    where: { id: categoryId },
    select: { isActive: true },
  });
  if (category?.isActive) return null;
  return { field: "categoryId", message: "選択したカテゴリは使用できません" };
}

/**
 * 正規化済みのタグ名に対応するタグ ID を返す。未登録のタグはここで作成する(マニフェスト E3)。
 * 同じ新規タグを同時に作るリクエストがあっても一意制約違反にならないよう skipDuplicates で作成する。
 */
async function resolveTagIds(tx: Db, names: string[]): Promise<string[]> {
  if (names.length === 0) return [];
  await tx.tag.createMany({ data: names.map((name) => ({ name })), skipDuplicates: true });
  const tags = await tx.tag.findMany({ where: { name: { in: names } }, select: { id: true } });
  return tags.map((tag) => tag.id);
}

/**
 * LIKE のワイルドカード(% _)とエスケープ文字(\)を文字として扱うようにする。
 * Prisma の contains はエスケープしないため、「100%」の検索が全件一致にならないよう自前で行う(マニフェスト E1)。
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** E1 イベント一覧(検索・絞り込み・ソート・ページング)を閲覧者から見た形で返す */
export async function listEvents(
  actor: Actor,
  query: ListEventsQuery,
): Promise<Paginated<EventSummary>> {
  const { q, categoryId, tag, sort, includePast, page, limit } = query;
  const where: Prisma.EventWhereInput = {
    // 論理削除済みはどの API からも見えない(マニフェスト 3-2)
    deletedAt: null,
    ...(includePast ? {} : { startsAt: { gte: new Date() } }),
    ...(q
      ? {
          OR: [
            { title: { contains: escapeLike(q), mode: "insensitive" } },
            { description: { contains: escapeLike(q), mode: "insensitive" } },
          ],
        }
      : {}),
    // 存在しない categoryId はエラーにせず 0 件を返す(マニフェスト E1)
    ...(categoryId ? { categoryId } : {}),
    ...(tag ? { tags: { some: { tag: { name: tag } } } } : {}),
  };
  const direction = sort === "startsAt_desc" ? "desc" : "asc";

  const [total, rows] = await Promise.all([
    prisma.event.count({ where }),
    prisma.event.findMany({
      where,
      include: eventSummaryInclude,
      // 同時刻のイベントでもページをまたいで順序がぶれないよう id で固定する(マニフェスト E1)
      orderBy: [{ startsAt: direction }, { id: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return { items: await toEventSummaries(actor, rows), total, page, limit };
}

/** E2 イベント詳細。無い・論理削除済みは NOT_FOUND */
export async function getEvent(actor: Actor, eventId: string): Promise<EventDetail> {
  return getEventDetail(actor, eventId);
}

/** E3 イベント作成。ログインユーザーを主催者にする */
export async function createEvent(actor: Actor, input: CreateEventInput): Promise<EventDetail> {
  // 「現在より未来」はクライアントの時計ではなくサーバー時刻で判定する(マニフェスト E3)
  const now = new Date();
  const startsAt = new Date(input.startsAt);
  const registrationDeadline = input.registrationDeadline
    ? new Date(input.registrationDeadline)
    : null;

  const details: FieldError[] = [];
  if (startsAt <= now) {
    details.push({ field: "startsAt", message: "開始日時は現在より後にしてください" });
  }
  if (registrationDeadline && registrationDeadline <= now) {
    details.push({ field: "registrationDeadline", message: "登録締切は現在より後にしてください" });
  }
  const issue = await categoryIssue(prisma, input.categoryId);
  if (issue) details.push(issue);
  throwIfIssues(details);

  return prisma.$transaction(async (tx) => {
    const tagIds = await resolveTagIds(tx, input.tags);
    const event = await tx.event.create({
      data: {
        title: input.title,
        description: input.description,
        location: input.location,
        startsAt,
        endsAt: new Date(input.endsAt),
        capacity: input.capacity,
        registrationDeadline,
        cancelDeadline: input.cancelDeadline ? new Date(input.cancelDeadline) : null,
        categoryId: input.categoryId,
        // 主催者はボディからは受け取らず、常にログインユーザー(マニフェスト E3)
        organizerId: actor.id,
        tags: { create: tagIds.map((tagId) => ({ tagId })) },
      },
    });
    return getEventDetail(actor, event.id, tx);
  });
}

/** null 許容の日時が同じ値か(ISO 文字列と DB の Date を時刻で比べる) */
function sameTime(current: Date | null, sent: string | null): boolean {
  if (current === null || sent === null) return current === sent;
  return current.getTime() === new Date(sent).getTime();
}

/**
 * 送信された項目のうち、現在値と異なるものだけを返す。
 * 同じ値の送信は「変更」とみなさない(マニフェスト E4)ので、開催後の 409 や警告の判定に使う。
 */
function pickChanges(event: Event, currentTags: string[], input: UpdateEventInput) {
  const differs = (key: keyof UpdateEventInput, same: boolean) => input[key] !== undefined && !same;
  const sortedTags = (tags: string[]) => [...tags].sort().join("\n");
  return {
    title: differs("title", input.title === event.title),
    description: differs("description", input.description === event.description),
    location: differs("location", input.location === event.location),
    startsAt: differs("startsAt", sameTime(event.startsAt, input.startsAt ?? null)),
    endsAt: differs("endsAt", sameTime(event.endsAt, input.endsAt ?? null)),
    capacity: differs("capacity", input.capacity === event.capacity),
    registrationDeadline: differs(
      "registrationDeadline",
      sameTime(event.registrationDeadline, input.registrationDeadline ?? null),
    ),
    cancelDeadline: differs(
      "cancelDeadline",
      sameTime(event.cancelDeadline, input.cancelDeadline ?? null),
    ),
    categoryId: differs("categoryId", input.categoryId === event.categoryId),
    tags: differs("tags", sortedTags(input.tags ?? []) === sortedTags(currentTags)),
  };
}

/** コミット後に出す日時変更ログの内容 */
type ScheduleChangeLog = {
  eventId: string;
  oldStartsAt: string;
  oldEndsAt: string;
  newStartsAt: string;
  newEndsAt: string;
  participantCount: number;
};

/** E4 イベント編集。定員増加時の繰り上げと、参加者ありの日時変更の警告を含む */
export async function updateEvent(
  actor: Actor,
  eventId: string,
  input: UpdateEventInput,
): Promise<UpdateEventResult> {
  const { result, promotions, scheduleLog } = await prisma.$transaction(async (tx) => {
    // 定員・参加者数の判定と繰り上げを、同じイベントへの登録・キャンセルと直列化する(マニフェスト 3-6)
    const event = await lockEvent(tx, eventId);
    assertCanManageEvent(actor, event);

    const now = new Date();
    const currentTags = await tx.eventTag.findMany({
      where: { eventId },
      select: { tag: { select: { name: true } } },
    });
    const changed = pickChanges(
      event,
      currentTags.map((eventTag) => eventTag.tag.name),
      input,
    );

    // 開催開始後は日時・定員・締切・期限を変えられない。タイトル等は変更可(マニフェスト 3-2)
    const scheduleOrCapacityChanged =
      changed.startsAt ||
      changed.endsAt ||
      changed.capacity ||
      changed.registrationDeadline ||
      changed.cancelDeadline;
    if (scheduleOrCapacityChanged && now >= event.startsAt) {
      throw new AppError("EVENT_ALREADY_STARTED", "開催開始後は日時・定員・締切を変更できません");
    }

    // 前後関係は既存値と送信値をマージした更新後の値で検証する(マニフェスト E4)
    const merged = {
      startsAt: changed.startsAt && input.startsAt ? new Date(input.startsAt) : event.startsAt,
      endsAt: changed.endsAt && input.endsAt ? new Date(input.endsAt) : event.endsAt,
      registrationDeadline:
        input.registrationDeadline === undefined
          ? event.registrationDeadline
          : input.registrationDeadline && new Date(input.registrationDeadline),
      cancelDeadline:
        input.cancelDeadline === undefined
          ? event.cancelDeadline
          : input.cancelDeadline && new Date(input.cancelDeadline),
    };
    const details = scheduleIssues(merged);
    if (changed.startsAt && merged.startsAt <= now) {
      details.push({ field: "startsAt", message: "開始日時は現在より後にしてください" });
    }
    if (
      changed.registrationDeadline &&
      merged.registrationDeadline &&
      merged.registrationDeadline <= now
    ) {
      details.push({
        field: "registrationDeadline",
        message: "登録締切は現在より後にしてください",
      });
    }
    // 無効化済みの現在カテゴリは、変更しなければそのまま保存できる(マニフェスト 3-2)
    if (changed.categoryId && input.categoryId) {
      const issue = await categoryIssue(tx, input.categoryId);
      if (issue) details.push(issue);
    }
    throwIfIssues(details);

    const registeredCount = await tx.registration.count({ where: { eventId } });
    if (changed.capacity && input.capacity !== undefined && input.capacity < registeredCount) {
      throw new AppError(
        "CAPACITY_BELOW_REGISTERED",
        `定員は現在の参加確定者数(${String(registeredCount)} 人)以上にしてください`,
      );
    }

    const scheduleChanged = (changed.startsAt || changed.endsAt) && registeredCount > 0;
    const updated = await tx.event.update({
      where: { id: eventId },
      data: {
        title: input.title,
        description: input.description,
        location: input.location,
        startsAt: merged.startsAt,
        endsAt: merged.endsAt,
        capacity: input.capacity,
        registrationDeadline: merged.registrationDeadline,
        cancelDeadline: merged.cancelDeadline,
        categoryId: input.categoryId,
        // 参加確定者に詳細画面で日時変更のバナーを出すため(マニフェスト 3-2)
        ...(scheduleChanged ? { scheduleChangedAt: now } : {}),
      },
    });

    if (changed.tags && input.tags) {
      // タグは指定された集合で丸ごと置き換える(マニフェスト E4)
      const tagIds = await resolveTagIds(tx, input.tags);
      await tx.eventTag.deleteMany({ where: { eventId } });
      await tx.eventTag.createMany({ data: tagIds.map((tagId) => ({ eventId, tagId })) });
    }

    let promotions: Promotion[] = [];
    if (changed.capacity && updated.capacity > event.capacity) {
      // 増えた枠の分だけ繰り上げる。待機者がいるのは満席時だけなので、空き数 = 増えた枠数になる(マニフェスト 3-6)
      promotions = await promoteWaiters(tx, updated, {
        count: updated.capacity - registeredCount,
        trigger: "CAPACITY_INCREASE",
        vacatedByUserId: null,
      });
    }

    const warnings: EventUpdateWarning[] = [];
    if (scheduleChanged) {
      warnings.push({
        code: "SCHEDULE_CHANGED_WITH_PARTICIPANTS",
        participantCount: registeredCount,
      });
    }
    if (promotions.length > 0) {
      warnings.push({ code: "WAITLIST_PROMOTED", promotedCount: promotions.length });
    }

    const scheduleLog: ScheduleChangeLog | null = scheduleChanged
      ? {
          eventId,
          oldStartsAt: event.startsAt.toISOString(),
          oldEndsAt: event.endsAt.toISOString(),
          newStartsAt: updated.startsAt.toISOString(),
          newEndsAt: updated.endsAt.toISOString(),
          participantCount: registeredCount,
        }
      : null;

    const detail = await getEventDetail(actor, eventId, tx);
    return { result: { event: detail, warnings }, promotions, scheduleLog };
  });

  // 通知の代わりのログは、ロールバックされた変更を残さないようコミット後に出す(マニフェスト 3-8)
  logPromotions(promotions);
  if (scheduleLog) logger.warn("event schedule changed with participants", scheduleLog);
  return result;
}

/** E5 イベントを論理削除する。参加・待機・フィードバックの行は履歴として残す */
export async function deleteEvent(actor: Actor, eventId: string): Promise<void> {
  const counts = await prisma.$transaction(async (tx) => {
    // 処理中の参加登録が削除済みイベントに登録しないよう、ロックしてから削除する(マニフェスト E5)
    const event = await lockEvent(tx, eventId);
    assertCanManageEvent(actor, event);

    const registeredCount = await tx.registration.count({ where: { eventId } });
    const waitlistCount = await tx.waitlistEntry.count({ where: { eventId } });
    await tx.event.update({ where: { id: eventId }, data: { deletedAt: new Date() } });
    return { registeredCount, waitlistCount };
  });

  // 参加者・待機者への通知の代わりに、コミット後に件数をログに残す(マニフェスト E5)
  if (counts.registeredCount > 0 || counts.waitlistCount > 0) {
    logger.info("event deleted with participants", { eventId, ...counts });
  }
}
