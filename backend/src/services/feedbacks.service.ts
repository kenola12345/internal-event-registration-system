import type { Prisma } from "@prisma/client";
import type {
  CreateFeedbackInput,
  Feedback,
  FeedbackList,
  FeedbackVisibilityInput,
  ListFeedbacksQuery,
  UpdateFeedbackInput,
} from "@template/shared";

import { AppError } from "../errors/AppError.js";
import { prisma } from "../lib/prisma.js";
import { isUniqueViolation } from "../lib/prisma-errors.js";
import type { Actor } from "./policies/event-policy.js";

// フィードバック(F1〜F4)のビジネスルールとクエリ。ルールはマニフェスト 3-7 / 5.2 feedbacks に従う。

const feedbackInclude = {
  user: { select: { id: true, name: true } },
} satisfies Prisma.FeedbackInclude;

type FeedbackRow = Prisma.FeedbackGetPayload<{ include: typeof feedbackInclude }>;

/** フィードバック行を閲覧者から見た API の形にする */
function toFeedback(row: FeedbackRow, viewer: Actor): Feedback {
  // 匿名投稿の投稿者は admin にだけ見せる。本人の投稿でも null にし、本人判定は isMine に任せる(マニフェスト 3-7)
  const hideAuthor = row.isAnonymous && viewer.role !== "ADMIN";
  return {
    id: row.id,
    rating: row.rating,
    comment: row.comment,
    isAnonymous: row.isAnonymous,
    author: hideAuthor ? null : { id: row.user.id, name: row.user.name },
    isHidden: row.isHidden,
    isMine: row.userId === viewer.id,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** 未削除のイベントを取得する。無い・削除済みは 404 */
async function findActiveEvent(eventId: string) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, deletedAt: null },
    select: { id: true, organizerId: true, endsAt: true },
  });
  if (!event) throw new AppError("NOT_FOUND", "イベントが見つかりません");
  return event;
}

/** 閲覧者がそのイベントに出席(PRESENT)と記録されているか */
async function isPresent(eventId: string, userId: string): Promise<boolean> {
  const registration = await prisma.registration.findUnique({
    where: { eventId_userId: { eventId, userId } },
    select: { attendance: true },
  });
  return registration?.attendance === "PRESENT";
}

/** F1 レビュー一覧・平均評価・自分の投稿を返す */
export async function listFeedbacks(
  eventId: string,
  query: ListFeedbacksQuery,
  viewer: Actor,
): Promise<FeedbackList> {
  await findActiveEvent(eventId);

  // 一般ユーザーには公開分のみ、admin には非公開分も含めて見せる(マニフェスト 3-7)
  const itemsWhere: Prisma.FeedbackWhereInput =
    viewer.role === "ADMIN" ? { eventId } : { eventId, isHidden: false };

  const [aggregate, total, rows, mine] = await Promise.all([
    // 平均・件数は閲覧者のロールに関わらず非公開分を除いて集計する(マニフェスト 3-7)
    prisma.feedback.aggregate({
      where: { eventId, isHidden: false },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    prisma.feedback.count({ where: itemsWhere }),
    prisma.feedback.findMany({
      where: itemsWhere,
      include: feedbackInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    // 本人には非公開化された投稿も「非公開」状態で見せる(マニフェスト 3-7)
    prisma.feedback.findUnique({
      where: { eventId_userId: { eventId, userId: viewer.id } },
      include: feedbackInclude,
    }),
  ]);

  const average = aggregate._avg.rating;
  return {
    rating: {
      average: average === null ? null : Math.round(average * 10) / 10,
      count: aggregate._count._all,
    },
    myFeedback: mine ? toFeedback(mine, viewer) : null,
    items: rows.map((row) => toFeedback(row, viewer)),
    total,
    page: query.page,
    limit: query.limit,
  };
}

/** F2 自分のフィードバックを投稿する */
export async function createFeedback(
  eventId: string,
  input: CreateFeedbackInput,
  viewer: Actor,
): Promise<Feedback> {
  const event = await findActiveEvent(eventId);

  // 投稿条件はマニフェスト 3-7 / F2 の判定順で確認し、理由ごとにメッセージを分ける
  if (event.organizerId === viewer.id) {
    throw new AppError(
      "FEEDBACK_NOT_ALLOWED",
      "主催者は自分のイベントにフィードバックを投稿できません",
    );
  }
  if (Date.now() < event.endsAt.getTime()) {
    throw new AppError("FEEDBACK_NOT_ALLOWED", "イベントの開催終了後に投稿できます");
  }
  if (!(await isPresent(eventId, viewer.id))) {
    throw new AppError("FEEDBACK_NOT_ALLOWED", "出席が記録されていないため投稿できません");
  }

  const existing = await prisma.feedback.findUnique({
    where: { eventId_userId: { eventId, userId: viewer.id } },
    select: { id: true },
  });
  if (existing) throw new AppError("FEEDBACK_ALREADY_EXISTS", "このイベントには投稿済みです");

  try {
    const row = await prisma.feedback.create({
      data: {
        eventId,
        userId: viewer.id,
        rating: input.rating,
        comment: input.comment,
        isAnonymous: input.isAnonymous,
      },
      include: feedbackInclude,
    });
    return toFeedback(row, viewer);
  } catch (error) {
    // 同時投稿で事前チェックをすり抜けた場合も、1 イベント 1 人 1 件の違反として 409 にする
    if (isUniqueViolation(error)) {
      throw new AppError("FEEDBACK_ALREADY_EXISTS", "このイベントには投稿済みです");
    }
    throw error;
  }
}

/** F3 自分のフィードバックを編集する */
export async function updateFeedback(
  eventId: string,
  input: UpdateFeedbackInput,
  viewer: Actor,
): Promise<Feedback> {
  await findActiveEvent(eventId);

  const existing = await prisma.feedback.findUnique({
    where: { eventId_userId: { eventId, userId: viewer.id } },
    select: { id: true },
  });
  if (!existing) throw new AppError("NOT_FOUND", "フィードバックが見つかりません");

  // 投稿後に欠席・未マークへ修正された場合は編集させない(マニフェスト 3-7: 編集時も PRESENT を再確認)
  if (!(await isPresent(eventId, viewer.id))) {
    throw new AppError("FEEDBACK_NOT_ALLOWED", "出席が記録されていないため編集できません");
  }

  // 非公開状態(isHidden / hiddenAt / hiddenById)は更新対象に含めない。
  // admin の判断を投稿者が解除できないようにするため(マニフェスト 3-7)
  const row = await prisma.feedback.update({
    where: { id: existing.id },
    data: {
      rating: input.rating,
      comment: input.comment,
      isAnonymous: input.isAnonymous,
    },
    include: feedbackInclude,
  });
  return toFeedback(row, viewer);
}

/** F4 admin がフィードバックを非公開化・再公開する(冪等) */
export async function setFeedbackVisibility(
  feedbackId: string,
  input: FeedbackVisibilityInput,
  admin: Actor,
): Promise<Feedback> {
  // 削除済みイベントのレビューは対象外にする(マニフェスト F4)
  const existing = await prisma.feedback.findFirst({
    where: { id: feedbackId, event: { deletedAt: null } },
    select: { id: true },
  });
  if (!existing) throw new AppError("NOT_FOUND", "フィードバックが見つかりません");

  const row = await prisma.feedback.update({
    where: { id: existing.id },
    data: input.isHidden
      ? { isHidden: true, hiddenAt: new Date(), hiddenById: admin.id }
      : { isHidden: false, hiddenAt: null, hiddenById: null },
    include: feedbackInclude,
  });
  return toFeedback(row, admin);
}
