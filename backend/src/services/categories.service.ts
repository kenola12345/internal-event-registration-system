import type {
  Category,
  CategoryWithUsage,
  CreateCategoryInput,
  UpdateCategoryInput,
  UserRole,
} from "@template/shared";

import { AppError } from "../errors/AppError.js";
import { prisma } from "../lib/prisma.js";
import { isForeignKeyViolation, isUniqueViolation } from "../lib/prisma-errors.js";
import { toCategory } from "./event-view.service.js";

// カテゴリ(C1〜C4)のビジネスルール(マニフェスト 3-4)

const NAME_TAKEN_MESSAGE = "同じ名前のカテゴリが既にあります";

/** 名前の一意制約違反(P2002)を CATEGORY_NAME_TAKEN に変換する。それ以外はそのまま投げ直す */
function rethrowNameTaken(error: unknown): never {
  if (isUniqueViolation(error)) throw new AppError("CATEGORY_NAME_TAKEN", NAME_TAKEN_MESSAGE);
  throw error;
}

/**
 * 大文字小文字を区別せず同名のカテゴリ(無効化済みを含む)があれば CATEGORY_NAME_TAKEN を投げる。
 * WHY: 「React勉強会」と「react勉強会」を別カテゴリにしない(マニフェスト 3-4)。
 * DB の lower(name) 一意インデックスと同じ比較にするため、lower() で比べる。
 */
async function assertNameAvailable(name: string, excludeId?: string): Promise<void> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM categories WHERE lower(name) = lower(${name})
  `;
  if (rows.some((row) => row.id !== excludeId)) {
    throw new AppError("CATEGORY_NAME_TAKEN", NAME_TAKEN_MESSAGE);
  }
}

/** カテゴリを取得する。無ければ NOT_FOUND */
async function findCategoryOrThrow(categoryId: string) {
  const row = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!row) throw new AppError("NOT_FOUND", "カテゴリが見つかりません");
  return row;
}

/**
 * C1 カテゴリ一覧。通常は有効なものだけを返す。
 * WHY: includeInactive は admin のみ有効で、member の指定はエラーにせず無視する(マニフェスト 3-4)。
 * admin の管理画面では削除可否の判断に使うため、論理削除済みを含む使用件数 eventCount を付ける。
 */
export async function listCategories(
  role: UserRole,
  includeInactive: boolean,
): Promise<CategoryWithUsage[]> {
  const orderBy = [{ sortOrder: "asc" as const }, { name: "asc" as const }];

  if (role === "ADMIN" && includeInactive) {
    // _count はリレーションを素直に数えるので、論理削除済みイベントも含まれる(削除可否の判定と一致させる)
    const rows = await prisma.category.findMany({
      orderBy,
      include: { _count: { select: { events: true } } },
    });
    return rows.map((row) => ({ ...toCategory(row), eventCount: row._count.events }));
  }

  const rows = await prisma.category.findMany({ where: { isActive: true }, orderBy });
  return rows.map(toCategory);
}

/** C2 カテゴリを追加する。作成時は常に有効 */
export async function createCategory(input: CreateCategoryInput): Promise<Category> {
  await assertNameAvailable(input.name);
  try {
    const row = await prisma.category.create({
      data: { name: input.name, sortOrder: input.sortOrder, isActive: true },
    });
    return toCategory(row);
  } catch (error) {
    // 事前チェックと作成の間に同名が作られた場合は DB の一意制約で検出する
    rethrowNameTaken(error);
  }
}

/**
 * C3 カテゴリの名前・表示順・有効/無効を変更する。
 * WHY: 使用中カテゴリは削除できないので、使わせたくない場合は isActive: false で無効化する(マニフェスト 3-4)。
 */
export async function updateCategory(
  categoryId: string,
  input: UpdateCategoryInput,
): Promise<Category> {
  await findCategoryOrThrow(categoryId);
  if (input.name !== undefined) await assertNameAvailable(input.name, categoryId);
  try {
    const row = await prisma.category.update({ where: { id: categoryId }, data: input });
    return toCategory(row);
  } catch (error) {
    rethrowNameTaken(error);
  }
}

/** 使用中カテゴリの削除エラー。件数を示し、無効化を案内する */
function categoryInUse(count: number | null): AppError {
  const usage = count === null ? "イベント" : `イベント ${String(count)} 件`;
  return new AppError(
    "CATEGORY_IN_USE",
    `このカテゴリは${usage}で使われているため削除できません。代わりに無効化してください`,
  );
}

/**
 * C4 未使用のカテゴリを物理削除する。
 * WHY: 論理削除済みを含め 1 件でもイベントが紐づくなら削除しない。自動移動は過去集計の書き換えになるため、
 * 使用中は無効化で対応する(マニフェスト 3-4)。
 */
export async function deleteCategory(categoryId: string): Promise<void> {
  await findCategoryOrThrow(categoryId);
  // deletedAt で絞らない: 論理削除済みイベントも数える
  const count = await prisma.event.count({ where: { categoryId } });
  if (count > 0) throw categoryInUse(count);
  try {
    await prisma.category.delete({ where: { id: categoryId } });
  } catch (error) {
    // 判定と削除の間にイベントが作られた場合は外部キー(ON DELETE RESTRICT)違反になる
    if (isForeignKeyViolation(error)) {
      throw categoryInUse(await prisma.event.count({ where: { categoryId } }));
    }
    throw error;
  }
}
