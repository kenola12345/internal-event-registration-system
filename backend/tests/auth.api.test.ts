import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { app, createUser, loggedInAgent, resetDb } from "./helpers.js";

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
});
