import { z } from "zod";

/** 1 イベントあたりのタグの上限(マニフェスト 3-4) */
export const MAX_TAGS_PER_EVENT = 10;
/** 正規化後のタグ名の最大長 */
export const MAX_TAG_LENGTH = 20;

/**
 * タグ名を正規化する: trim → NFKC → 英字小文字化 → 連続空白を 1 つ。
 * 「React」「react」「ＲＥＡＣＴ」を同じタグとして扱うため(マニフェスト 3-4)。保存・検索の両方で使う。
 */
export function normalizeTag(raw: string): string {
  return raw.trim().normalize("NFKC").toLowerCase().replace(/\s+/g, " ");
}

/** タグ入力 1 件。正規化してから長さを検証する */
export const tagSchema = z
  .string()
  .transform(normalizeTag)
  .pipe(
    z
      .string()
      .min(1, "空のタグは指定できません")
      .max(MAX_TAG_LENGTH, `タグは ${String(MAX_TAG_LENGTH)} 文字以内にしてください`),
  );

/** イベントのタグ配列。正規化後に重複をまとめる */
export const tagsSchema = z
  .array(tagSchema)
  .max(MAX_TAGS_PER_EVENT, `タグは ${String(MAX_TAGS_PER_EVENT)} 個までです`)
  .transform((tags) => [...new Set(tags)]);

/** T1 タグ候補のクエリ */
export const listTagsQuerySchema = z.object({
  q: z
    .string()
    .max(MAX_TAG_LENGTH)
    .optional()
    .transform((value) => (value ? normalizeTag(value) : "")),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

export type ListTagsQuery = z.infer<typeof listTagsQuerySchema>;

export type TagSuggestion = { name: string; eventCount: number };
