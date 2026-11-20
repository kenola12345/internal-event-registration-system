import { Prisma } from "@prisma/client";

/** 一意制約違反(P2002)か。同時リクエストが事前チェックをすり抜けたときの検出に使う */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** 外部キー制約違反(P2003)か。使用中のカテゴリ削除などの検出に使う */
export function isForeignKeyViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
}
