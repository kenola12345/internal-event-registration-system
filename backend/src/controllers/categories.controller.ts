import {
  categoryIdParamSchema,
  createCategorySchema,
  listCategoriesQuerySchema,
  updateCategorySchema,
} from "@template/shared";
import type { RequestHandler } from "express";

import { currentUser } from "../middleware/auth.js";
import { getValidated } from "../middleware/validate.js";
import * as categories from "../services/categories.service.js";

// カテゴリ(C1〜C4)のコントローラ。検証済みの入力を読み、サービスを呼んで返すだけ。

/** C1 カテゴリ一覧。includeInactive の扱いはロールに応じてサービスが決める */
export const list: RequestHandler = async (req, res) => {
  const { includeInactive } = getValidated(req, "query", listCategoriesQuerySchema);
  const data = await categories.listCategories(currentUser(req).role, includeInactive);
  res.json({ data });
};

/** C2 カテゴリ追加 */
export const create: RequestHandler = async (req, res) => {
  const input = getValidated(req, "body", createCategorySchema);
  const data = await categories.createCategory(input);
  res.status(201).json({ data });
};

/** C3 カテゴリ編集 */
export const update: RequestHandler = async (req, res) => {
  const { categoryId } = getValidated(req, "params", categoryIdParamSchema);
  const input = getValidated(req, "body", updateCategorySchema);
  const data = await categories.updateCategory(categoryId, input);
  res.json({ data });
};

/** C4 カテゴリ削除 */
export const remove: RequestHandler = async (req, res) => {
  const { categoryId } = getValidated(req, "params", categoryIdParamSchema);
  await categories.deleteCategory(categoryId);
  res.status(204).end();
};
