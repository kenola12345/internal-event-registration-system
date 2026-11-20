import type { LoginInput, User } from "@template/shared";

import { apiFetch, jsonBody } from "@/lib/api-client";

export const fetchMe = (): Promise<User> => apiFetch<User>("/auth/me");

export const login = (input: LoginInput): Promise<User> =>
  apiFetch<User>("/auth/login", { method: "POST", ...jsonBody(input) });

export async function logout(): Promise<void> {
  await apiFetch<undefined>("/auth/logout", { method: "POST" });
}
