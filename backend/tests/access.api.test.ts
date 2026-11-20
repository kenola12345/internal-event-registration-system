import request from "supertest";
import { describe, expect, it } from "vitest";

import { app } from "./helpers.js";

// 未ログインで呼べるのは A1 ログイン・A2 ログアウト・H1 ヘルスチェックのみ(マニフェスト 2.5)。
// それ以外の全エンドポイントが 401 になることを 1 か所でまとめて確認し、requireAuth の付け忘れを防ぐ。

const eventId = "cmaaaaaaaaaaaaaaaaaaaaaaa";
const registrationId = "cmbbbbbbbbbbbbbbbbbbbbbbb";
const feedbackId = "cmccccccccccccccccccccccc";
const categoryId = "cmddddddddddddddddddddddd";

type Method = "get" | "post" | "put" | "patch" | "delete";

const protectedEndpoints: [Method, string][] = [
  ["get", "/api/auth/me"],
  ["get", "/api/events"],
  ["get", `/api/events/${eventId}`],
  ["post", "/api/events"],
  ["patch", `/api/events/${eventId}`],
  ["delete", `/api/events/${eventId}`],
  ["post", `/api/events/${eventId}/registration`],
  ["delete", `/api/events/${eventId}/registration`],
  ["get", `/api/events/${eventId}/registrations`],
  ["delete", `/api/events/${eventId}/registrations/${registrationId}`],
  ["put", `/api/events/${eventId}/registrations/${registrationId}/attendance`],
  ["post", `/api/events/${eventId}/waitlist`],
  ["delete", `/api/events/${eventId}/waitlist`],
  ["get", `/api/events/${eventId}/feedbacks`],
  ["post", `/api/events/${eventId}/feedback`],
  ["patch", `/api/events/${eventId}/feedback`],
  ["patch", `/api/feedbacks/${feedbackId}/visibility`],
  ["get", "/api/categories"],
  ["post", "/api/categories"],
  ["patch", `/api/categories/${categoryId}`],
  ["delete", `/api/categories/${categoryId}`],
  ["get", "/api/tags"],
  ["get", "/api/me/events"],
  ["get", "/api/me/stats"],
];

describe("未ログインのアクセス", () => {
  it.each(protectedEndpoints)("%s %s は 401 UNAUTHENTICATED", async (method, path) => {
    const res = await request(app)[method](path).send({});
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("保護対象の一覧はマニフェストのエンドポイント 27 本から公開の 3 本を除いた 24 本", () => {
    expect(protectedEndpoints).toHaveLength(24);
  });

  it("ヘルスチェックは未ログインでも 200", async () => {
    await request(app).get("/api/health").expect(200);
  });
});
