import { z } from "zod";

import { booleanQuerySchema, type FieldError, idSchema, paginationQuerySchema } from "./api.js";
import type { UserSummary } from "./auth.js";
import type { Category } from "./category.js";
import { MAX_TAG_LENGTH, normalizeTag, tagsSchema } from "./tag.js";

export const eventIdParamSchema = z.object({ eventId: idSchema });

// ---------------------------------------------------------------------------
// E1 一覧のクエリ
// ---------------------------------------------------------------------------

export const EVENT_SORTS = ["startsAt_asc", "startsAt_desc"] as const;

export const listEventsQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  categoryId: idSchema.optional(),
  tag: z.string().transform(normalizeTag).pipe(z.string().min(1).max(MAX_TAG_LENGTH)).optional(),
  sort: z.enum(EVENT_SORTS).default("startsAt_asc"),
  includePast: booleanQuerySchema,
});

export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;

// ---------------------------------------------------------------------------
// E3 作成 / E4 編集の入力
// ---------------------------------------------------------------------------

const isoDateTime = z.iso.datetime({ offset: true, message: "日時の形式が正しくありません" });

const eventFields = {
  title: z
    .string()
    .trim()
    .min(1, "タイトルを入力してください")
    .max(100, "タイトルは 100 文字以内にしてください"),
  description: z
    .string()
    .trim()
    .min(1, "説明を入力してください")
    .max(2000, "説明は 2000 文字以内にしてください"),
  // 空文字は「場所なし」として null で保存する
  location: z
    .string()
    .trim()
    .max(100, "場所は 100 文字以内にしてください")
    .nullable()
    .transform((value) => (value ? value : null)),
  startsAt: isoDateTime,
  endsAt: isoDateTime,
  capacity: z
    .int("定員は整数で入力してください")
    .min(1, "定員は 1 以上にしてください")
    .max(1000, "定員は 1000 以下にしてください"),
  registrationDeadline: isoDateTime.nullable(),
  cancelDeadline: isoDateTime.nullable(),
  categoryId: idSchema,
  tags: tagsSchema,
};

/** 日時の前後関係(現在時刻に依存しないもの)。作成時はスキーマで、編集時はマージ後の値でサービスが使う */
export type EventSchedule = {
  startsAt: string | Date;
  endsAt: string | Date;
  registrationDeadline?: string | Date | null;
  cancelDeadline?: string | Date | null;
};

/**
 * 終了 > 開始、締切・期限 <= 開始 を検証し、違反した項目を返す(マニフェスト 3-2)。
 * DB の CHECK 制約と同じ条件を、利用者に分かるエラーとして先に返すために使う。
 */
export function scheduleIssues(schedule: EventSchedule): FieldError[] {
  const starts = new Date(schedule.startsAt).getTime();
  const issues: FieldError[] = [];
  if (new Date(schedule.endsAt).getTime() <= starts) {
    issues.push({ field: "endsAt", message: "終了日時は開始日時より後にしてください" });
  }
  if (schedule.registrationDeadline && new Date(schedule.registrationDeadline).getTime() > starts) {
    issues.push({ field: "registrationDeadline", message: "登録締切は開始日時以前にしてください" });
  }
  if (schedule.cancelDeadline && new Date(schedule.cancelDeadline).getTime() > starts) {
    issues.push({ field: "cancelDeadline", message: "キャンセル期限は開始日時以前にしてください" });
  }
  return issues;
}

/** E3 イベント作成。「現在より未来」の判定はサーバー時刻で行うためサービス側で検証する */
export const createEventSchema = z
  .object({
    ...eventFields,
    location: eventFields.location.optional().transform((value) => value ?? null),
    registrationDeadline: eventFields.registrationDeadline.optional().transform((v) => v ?? null),
    cancelDeadline: eventFields.cancelDeadline.optional().transform((v) => v ?? null),
    tags: eventFields.tags.default([]),
  })
  .superRefine((value, ctx) => {
    for (const issue of scheduleIssues(value)) {
      ctx.addIssue({ code: "custom", path: [issue.field], message: issue.message });
    }
  });

/** E4 イベント編集(最低 1 項目)。前後関係は既存値とマージしてからサービスで検証する */
export const updateEventSchema = z
  .object(eventFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, "変更する項目を 1 つ以上指定してください");

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

// ---------------------------------------------------------------------------
// レスポンス
// ---------------------------------------------------------------------------

/** ログインユーザーから見たイベントとの関係 */
export type MyEventStatus =
  | { kind: "ORGANIZER" }
  | { kind: "REGISTERED" }
  | { kind: "WAITLISTED"; rank: number }
  | { kind: "NONE" };

/** E1 一覧の 1 件(カード表示用) */
export type EventSummary = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
  capacity: number;
  category: Category;
  tags: string[];
  organizer: UserSummary;
  registeredCount: number;
  remainingSeats: number;
  waitlistCount: number;
  myStatus: MyEventStatus;
};

/** 画面のボタン制御用。各 API はサーバー側で同じ条件を必ず再判定する(マニフェスト E2) */
export type EventPermissions = {
  canEdit: boolean;
  canManageAttendance: boolean;
  canMarkAttendance: boolean;
  canRegister: boolean;
  canJoinWaitlist: boolean;
  canCancel: boolean;
  canLeaveWaitlist: boolean;
  canPostFeedback: boolean;
  canEditFeedback: boolean;
};

/** E2 詳細 */
export type EventDetail = EventSummary & {
  description: string;
  registrationDeadline: string | null;
  cancelDeadline: string | null;
  scheduleChangedAt: string | null;
  participants: UserSummary[];
  rating: { average: number | null; count: number };
  permissions: EventPermissions;
  createdAt: string;
  updatedAt: string;
};

/** E4 の警告 */
export type EventUpdateWarning =
  | { code: "SCHEDULE_CHANGED_WITH_PARTICIPANTS"; participantCount: number }
  | { code: "WAITLIST_PROMOTED"; promotedCount: number };

export type UpdateEventResult = { event: EventDetail; warnings: EventUpdateWarning[] };
