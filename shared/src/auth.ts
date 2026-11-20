import { z } from "zod";

export const USER_ROLES = ["MEMBER", "ADMIN"] as const;
export type UserRole = (typeof USER_ROLES)[number];

// サインアップは提供しない(ユーザーは seed で作成する。マニフェスト 3-1)
export const loginSchema = z.object({
  email: z.email("Enter a valid email").trim().toLowerCase(),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** The user as the API exposes it. The password hash is NEVER part of this. */
export type User = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
};

/** 他のユーザーを表示するときの最小限の情報(主催者・参加者・投稿者) */
export type UserSummary = { id: string; name: string };
