import type { LoginInput, SignupInput, User } from "@template/shared";

import { apiFetch, jsonBody } from "@/lib/api-client";

export const fetchMe = (): Promise<User> => apiFetch<User>("/auth/me");

export const signup = (input: SignupInput): Promise<User> =>
  apiFetch<User>("/auth/signup", { method: "POST", ...jsonBody(input) });

export const login = (input: LoginInput): Promise<User> =>
  apiFetch<User>("/auth/login", { method: "POST", ...jsonBody(input) });

export async function logout(): Promise<void> {
  await apiFetch<undefined>("/auth/logout", { method: "POST" });
}
