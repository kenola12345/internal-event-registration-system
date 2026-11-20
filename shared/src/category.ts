import { z } from "zod";

import { booleanQuerySchema, idSchema } from "./api.js";

export const categoryIdParamSchema = z.object({ categoryId: idSchema });

const categoryName = z
  .string()
  .trim()
  .min(1, "カテゴリ名を入力してください")
  .max(30, "カテゴリ名は 30 文字以内にしてください");
const sortOrder = z.int().min(0).max(999);

/** C2 カテゴリ追加 */
export const createCategorySchema = z.object({
  name: categoryName,
  sortOrder: sortOrder.default(0),
});

/** C3 カテゴリ編集(最低 1 項目) */
export const updateCategorySchema = z
  .object({ name: categoryName, sortOrder, isActive: z.boolean() })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "変更する項目を 1 つ以上指定してください");

/** C1 一覧のクエリ。includeInactive は admin のみ有効(member の指定は無視する) */
export const listCategoriesQuerySchema = z.object({ includeInactive: booleanQuerySchema });

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>;

export type Category = { id: string; name: string; sortOrder: number; isActive: boolean };

/** admin が includeInactive=true で取得したときだけ eventCount(論理削除済みを含む使用件数)が付く */
export type CategoryWithUsage = Category & { eventCount?: number };
