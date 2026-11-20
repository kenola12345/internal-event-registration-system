import {
  categoryIdParamSchema,
  createCategorySchema,
  listCategoriesQuerySchema,
  updateCategorySchema,
} from "@template/shared";
import { Router } from "express";

import * as categories from "../controllers/categories.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";
import { validate } from "../middleware/validate.js";

// カテゴリ(C1〜C4) のルート(routes/index.ts への登録は済み)
export const categoriesRouter = Router();

// 一覧は全ロール。includeInactive の admin 限定はサービスで判定する(member の指定は無視。マニフェスト 3-4)
categoriesRouter.get(
  "/categories",
  requireAuth,
  validate({ query: listCategoriesQuerySchema }),
  categories.list,
);

// カテゴリはマスタなので変更は admin のみ(マニフェスト 3-4)
categoriesRouter.post(
  "/categories",
  requireAuth,
  requireRole("ADMIN"),
  validate({ body: createCategorySchema }),
  categories.create,
);
categoriesRouter.patch(
  "/categories/:categoryId",
  requireAuth,
  requireRole("ADMIN"),
  validate({ params: categoryIdParamSchema, body: updateCategorySchema }),
  categories.update,
);
categoriesRouter.delete(
  "/categories/:categoryId",
  requireAuth,
  requireRole("ADMIN"),
  validate({ params: categoryIdParamSchema }),
  categories.remove,
);
