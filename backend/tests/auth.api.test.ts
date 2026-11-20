import type { Request, Response } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../src/lib/prisma.js";
import { requireAuth } from "../src/middleware/auth.js";
import { app, createUser, loggedInAgent, loginAs, resetDb } from "./helpers.js";

beforeEach(resetDb);

describe("POST /api/auth/signup", () => {
  it("サインアップ API は提供しないので 404 ROUTE_NOT_FOUND", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ email: "alice@example.com", password: "password123", name: "Alice" })
      .expect(404);
    expect(res.body.error.code).toBe("ROUTE_NOT_FOUND");
  });
});

describe("POST /api/auth/login", () => {
  it("logs in with correct credentials, sets an httpOnly cookie and never returns the password hash", async () => {
    await createUser({ email: "alice@example.com" });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "Alice@Example.com", password: "password123" }) // email is case-insensitive
      .expect(200);
    expect(res.body.data.email).toBe("alice@example.com");
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|password/i);
    const cookie = res.headers["set-cookie"]?.[0] ?? "";
    expect(cookie).toMatch(/token=/);
    expect(cookie).toMatch(/HttpOnly/i);
    // クロスサイトの POST に Cookie を送らせない(CSRF 対策。マニフェスト 3-1)
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it("returns the role from the database as MEMBER / ADMIN", async () => {
    await createUser({ email: "admin@example.com", role: "ADMIN" });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "password123" })
      .expect(200);
    expect(res.body.data.role).toBe("ADMIN");
  });

  it("gives the same error for a wrong password and an unknown email", async () => {
    await createUser({ email: "alice@example.com" });
    const wrong = await request(app)
      .post("/api/auth/login")
      .send({ email: "alice@example.com", password: "wrong-password" })
      .expect(401);
    const unknown = await request(app)
      .post("/api/auth/login")
      .send({ email: "ghost@example.com", password: "password123" })
      .expect(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects invalid input with field details", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nope", password: "" })
      .expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(expect.arrayContaining(["email", "password"]));
  });
});

describe("GET /api/auth/me and logout", () => {
  it("returns 401 UNAUTHENTICATED without a cookie", async () => {
    const res = await request(app).get("/api/auth/me").expect(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns the current user, then 401 after logout", async () => {
    const agent = await loggedInAgent();
    const me = await agent.get("/api/auth/me").expect(200);
    expect(me.body.data.email).toBe("alice@example.com");
    await agent.post("/api/auth/logout").expect(204);
    await agent.get("/api/auth/me").expect(401);
  });

  it("rejects a tampered token", async () => {
    await request(app).get("/api/auth/me").set("Cookie", "token=not.a.jwt").expect(401);
  });

  it("logout answers 204 even when not logged in", async () => {
    await request(app).post("/api/auth/logout").expect(204);
  });

  it("トークンが有効でもユーザーが DB から消えていれば 401", async () => {
    const user = await createUser({ email: "gone@example.com" });
    const agent = await loginAs(user);
    await prisma.user.delete({ where: { id: user.id } });
    const res = await agent.get("/api/auth/me").expect(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });
});

describe("requireAuth", () => {
  it("トークン発行後に DB でロールを変えると、次のリクエストから新しいロールが使われる", async () => {
    // トークンには MEMBER が入ったまま。認可は DB の現在値を使う(マニフェスト 2.5)
    const user = await createUser({ email: "promoted@example.com" });
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "password123" })
      .expect(200);
    const token = /token=([^;]+)/.exec(login.headers["set-cookie"]?.[0] ?? "")?.[1];
    await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });

    const req = { cookies: { token } } as unknown as Request;
    let calledNext = false;
    await requireAuth(req, {} as unknown as Response, () => {
      calledNext = true;
    });

    expect(calledNext).toBe(true);
    expect(req.user).toEqual({ id: user.id, role: "ADMIN" });
  });
});
