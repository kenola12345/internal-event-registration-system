import type { RequestHandler } from "express";

import { AppError } from "../errors/AppError.js";
import { verifyToken } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";

export const AUTH_COOKIE = "token";

/**
 * ログイン必須のルートに付ける。有効な Cookie のトークンを検証し、req.user に { id, role } を設定する。
 * ロールはトークンの値ではなく DB の現在値を使う(ロール変更を即時反映し、存在しないユーザーを拒否するため。マニフェスト 2.5)。
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token = (req.cookies as Record<string, unknown> | undefined)?.[AUTH_COOKIE];
  const payload = typeof token === "string" ? verifyToken(token) : null;
  if (!payload) throw new AppError("UNAUTHENTICATED", "Please log in");

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true },
  });
  if (!user) throw new AppError("UNAUTHENTICATED", "Please log in");

  req.user = user;
  next();
};
