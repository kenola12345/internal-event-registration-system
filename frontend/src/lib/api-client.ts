import type { ApiErrorBody, ErrorCode, FieldError } from "@template/shared";

import { API_BASE_PATH } from "@/config";

/** Thrown when the API answers with { error }. Branch on `code`; show `details` next to form fields. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: FieldError[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Typed fetch wrapper: prefixes /api, unwraps { data }, converts failures into ApiError. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_BASE_PATH}${path}`, {
    credentials: "same-origin",
    ...init,
    headers,
  });

  if (res.status === 204) return undefined as T;
  if (res.ok) return ((await res.json()) as { data: T }).data;

  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  throw new ApiError(
    res.status,
    body?.error.code ?? "INTERNAL_ERROR",
    body?.error.message ?? "Something went wrong. Please try again.",
    body?.error.details,
  );
}

/** Shorthand for JSON request bodies. */
export function jsonBody(value: unknown): Pick<RequestInit, "body"> {
  return { body: JSON.stringify(value) };
}
