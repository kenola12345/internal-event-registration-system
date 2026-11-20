import type { UserRole } from "@template/shared";

import { AppError } from "../../errors/AppError.js";

/** 操作しているログインユーザー(requireAuth が設定する req.user と同じ形) */
export type Actor = { id: string; role: UserRole };

/**
 * イベントを管理(編集・削除・出席管理)できるか。主催者本人か admin なら true。
 * 主催者は独立したロールではなく organizerId で判定する(マニフェスト 2.1)。判定はこの関数に集約する。
 */
export function canManageEvent(actor: Actor, event: { organizerId: string }): boolean {
  return actor.role === "ADMIN" || event.organizerId === actor.id;
}

/** 管理できなければ 403。イベントは全員に公開されているため 404 にはしない(マニフェスト 2.5) */
export function assertCanManageEvent(actor: Actor, event: { organizerId: string }): void {
  if (!canManageEvent(actor, event)) {
    throw new AppError("FORBIDDEN", "このイベントを操作する権限がありません");
  }
}
