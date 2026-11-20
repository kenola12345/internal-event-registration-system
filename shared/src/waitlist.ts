import type { EventDetail } from "./event.js";

/** W1 のレスポンス。順位は event.myStatus.rank で返す(参加登録 API と同じ形) */
export type JoinWaitlistResult = { waitlistEntryId: string; event: EventDetail };
