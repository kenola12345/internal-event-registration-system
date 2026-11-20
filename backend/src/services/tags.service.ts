import type { ListTagsQuery, TagSuggestion } from "@template/shared";

import { prisma } from "../lib/prisma.js";

// タグ候補(T1)のビジネスルール(マニフェスト 3-4)

/**
 * T1 タグ候補を返す。q(正規化済み)で前方一致し、未削除イベントでの使用件数の多い順 → 名前順。
 * WHY: 候補は「よく使われているタグ」を上に出す(マニフェスト 3-4)。使用件数 0 のタグも候補に含める。
 * 件数順に並べてから limit を掛けるため、集計と並び替えを DB 側で行う(tagged template なので値はバインドされる)。
 * 前方一致は starts_with を使い、q に含まれる % や _ をワイルドカードとして扱わないようにする。
 */
export async function listTags({ q, limit }: ListTagsQuery): Promise<TagSuggestion[]> {
  return prisma.$queryRaw<TagSuggestion[]>`
    SELECT t.name, COUNT(e.id)::int AS "eventCount"
    FROM tags t
    LEFT JOIN event_tags et ON et.tag_id = t.id
    LEFT JOIN events e ON e.id = et.event_id AND e.deleted_at IS NULL
    WHERE starts_with(t.name, ${q})
    GROUP BY t.id, t.name
    ORDER BY "eventCount" DESC, t.name ASC
    LIMIT ${limit}
  `;
}
