import { z } from "zod";

import { idSchema, type Paginated, paginationQuerySchema } from "./api.js";
import type { UserSummary } from "./auth.js";

export const feedbackIdParamSchema = z.object({ feedbackId: idSchema });

const rating = z.int("評価は 1〜5 の整数にしてください").min(1).max(5);
const comment = z
  .string()
  .trim()
  .min(1, "コメントを入力してください")
  .max(200, "コメントは 200 文字以内にしてください");

/** F2 投稿 */
export const createFeedbackSchema = z.object({
  rating,
  comment,
  isAnonymous: z.boolean().default(false),
});

/** F3 編集(最低 1 項目) */
export const updateFeedbackSchema = z
  .object({ rating, comment, isAnonymous: z.boolean() })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "変更する項目を 1 つ以上指定してください");

/** F4 非公開化・再公開 */
export const feedbackVisibilitySchema = z.object({ isHidden: z.boolean() });

/** F1 一覧のクエリ */
export const listFeedbacksQuerySchema = paginationQuerySchema;

export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;
export type UpdateFeedbackInput = z.infer<typeof updateFeedbackSchema>;
export type FeedbackVisibilityInput = z.infer<typeof feedbackVisibilitySchema>;
export type ListFeedbacksQuery = z.infer<typeof listFeedbacksQuerySchema>;

export type Feedback = {
  id: string;
  rating: number;
  comment: string;
  isAnonymous: boolean;
  /** 匿名投稿で閲覧者が admin でなければ null(本人の投稿でも null。本人かどうかは isMine) */
  author: UserSummary | null;
  isHidden: boolean;
  isMine: boolean;
  createdAt: string;
  updatedAt: string;
};

/** F1 のレスポンス */
export type FeedbackList = Paginated<Feedback> & {
  rating: { average: number | null; count: number };
  myFeedback: Feedback | null;
};
