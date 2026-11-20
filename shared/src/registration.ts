import { z } from "zod";

import { idSchema } from "./api.js";
import type { UserSummary } from "./auth.js";
import type { EventDetail } from "./event.js";

export const ATTENDANCE_STATUSES = ["UNMARKED", "PRESENT", "ABSENT"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const registrationIdParamSchema = z.object({
  eventId: idSchema,
  registrationId: idSchema,
});

/** R5 出席マーク。どの状態からどの状態へも変更できる(誤操作リカバリ。マニフェスト 3-5) */
export const markAttendanceSchema = z.object({ status: z.enum(ATTENDANCE_STATUSES) });

export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;

/** R1 のレスポンス */
export type RegisterResult = { registrationId: string; event: EventDetail };

/** R3 のレスポンス */
export type EventRegistrations = {
  registrations: {
    id: string;
    user: UserSummary;
    attendance: AttendanceStatus;
    attendanceMarkedAt: string | null;
    registeredAt: string;
  }[];
  waitlist: { id: string; user: UserSummary; rank: number; joinedAt: string }[];
  summary: { present: number; absent: number; unmarked: number };
};

/** R5 のレスポンス */
export type AttendanceResult = {
  id: string;
  attendance: AttendanceStatus;
  attendanceMarkedAt: string | null;
};
