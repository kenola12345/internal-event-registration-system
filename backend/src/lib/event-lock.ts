import type { Event, Prisma } from "@prisma/client";

import { AppError } from "../errors/AppError.js";

/**
 * イベント行を SELECT ... FOR UPDATE でロックして返す。存在しない・論理削除済みなら NOT_FOUND。
 * 参加登録・キャンセル・待機・定員変更・削除を同じイベントについて直列化し、
 * 定員超過や二重繰り上げを防ぐため(マニフェスト 3-6)。必ずトランザクションの最初に呼ぶ。
 */
export async function lockEvent(tx: Prisma.TransactionClient, eventId: string): Promise<Event> {
  // タグ付きテンプレートなので eventId はパラメータとして渡る(SQL インジェクションにならない)
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM events WHERE id = ${eventId} AND deleted_at IS NULL FOR UPDATE`;
  if (rows.length === 0) throw new AppError("NOT_FOUND", "イベントが見つかりません");
  return tx.event.findUniqueOrThrow({ where: { id: eventId } });
}
