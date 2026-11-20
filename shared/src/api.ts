import { z } from "zod";

// The API response contract. Every endpoint returns either { data } or { error }.

/** エラーコードと HTTP ステータスの対応。マニフェスト 6 章の「エラーコード一覧」と一致させる */
export const ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  EVENT_NOT_STARTED: 400,
  INVALID_CREDENTIALS: 401,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  ORGANIZER_CANNOT_REGISTER: 403,
  FEEDBACK_NOT_ALLOWED: 403,
  NOT_FOUND: 404,
  ROUTE_NOT_FOUND: 404,
  ALREADY_REGISTERED: 409,
  EVENT_FULL: 409,
  SEATS_AVAILABLE: 409,
  REGISTRATION_CLOSED: 409,
  CANCEL_DEADLINE_PASSED: 409,
  EVENT_ALREADY_STARTED: 409,
  CAPACITY_BELOW_REGISTERED: 409,
  CATEGORY_IN_USE: 409,
  CATEGORY_NAME_TAKEN: 409,
  FEEDBACK_ALREADY_EXISTS: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

/** One invalid field, shown next to the matching form input. */
export type FieldError = { field: string; message: string };

export type ApiSuccess<T> = { data: T };

export type ApiErrorBody = {
  error: { code: ErrorCode; message: string; details?: FieldError[] };
};

/**
 * ID(Prisma の `@default(cuid())` が生成する CUID v1: "c" + 英小文字・数字 24 文字)。
 * Zod の z.cuid() は非推奨のため、形式を正規表現で検証する。
 */
export const idSchema = z.string().regex(/^c[a-z0-9]{24}$/, "ID の形式が正しくありません");

/** ページング共通のクエリ(page は 1 始まり、limit は最大 50。マニフェスト 6 章) */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** ページング付き一覧のレスポンス */
export type Paginated<T> = { items: T[]; total: number; page: number; limit: number };

/** クエリ文字列の "true" / "false" を真偽値にする(既定 false) */
export const booleanQuerySchema = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");
