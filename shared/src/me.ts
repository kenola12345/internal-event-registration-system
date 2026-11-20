import type { Category } from "./category.js";
import type { EventSummary } from "./event.js";
import type { AttendanceStatus } from "./registration.js";

/** M1 のレスポンス */
export type MyEvents = {
  organizing: EventSummary[];
  organizedPast: EventSummary[];
  registered: EventSummary[];
  waitlisted: EventSummary[];
  history: (EventSummary & { attendance: AttendanceStatus; hasFeedback: boolean })[];
};

/** M2 のレスポンス(定義はマニフェスト 3-5) */
export type MyStats = {
  participationCount: number;
  presentCount: number;
  absentCount: number;
  unmarkedCount: number;
  /** 0〜1。出席 + 欠席が 0 件なら null */
  attendanceRate: number | null;
  byCategory: { category: Category; count: number }[];
};
