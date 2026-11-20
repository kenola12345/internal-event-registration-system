import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../src/lib/prisma.js";
import { app, createCategory, createEvent, createUser, loginAs, resetDb } from "./helpers.js";

beforeEach(resetDb);

const MISSING_ID = "cmissingcategory000000000";

async function memberAgent() {
  return loginAs(await createUser({ email: "member@example.com" }));
}

async function adminAgent() {
  return loginAs(await createUser({ email: "admin@example.com", role: "ADMIN" }));
}

describe("GET /api/categories (C1)", () => {
  it("未ログインは 401", async () => {
    const res = await request(app).get("/api/categories").expect(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("有効なカテゴリだけを sortOrder → name の順で返す(無効カテゴリは member に出ない)", async () => {
    await createCategory({ name: "b", sortOrder: 1 });
    await createCategory({ name: "a", sortOrder: 1 });
    await createCategory({ name: "z", sortOrder: 0 });
    await createCategory({ name: "inactive", isActive: false });
    const agent = await memberAgent();

    const res = await agent.get("/api/categories").expect(200);
    expect(res.body.data.map((c: { name: string }) => c.name)).toEqual(["z", "a", "b"]);
    expect(res.body.data[0]).toEqual({
      id: expect.any(String),
      name: "z",
      sortOrder: 0,
      isActive: true,
    });
  });

  it("member の includeInactive=true は無視する(無効カテゴリも eventCount も出ない)", async () => {
    await createCategory({ name: "active" });
    await createCategory({ name: "inactive", isActive: false });
    const agent = await memberAgent();

    const res = await agent.get("/api/categories?includeInactive=true").expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe("active");
    expect(res.body.data[0]).not.toHaveProperty("eventCount");
  });

  it("admin の includeInactive=true は無効カテゴリと eventCount(論理削除済みを含む)を返す", async () => {
    const admin = await createUser({ email: "admin@example.com", role: "ADMIN" });
    const used = await createCategory({ name: "used", sortOrder: 0 });
    await createCategory({ name: "inactive", sortOrder: 1, isActive: false });
    await createEvent({ organizerId: admin.id, categoryId: used.id });
    await createEvent({ organizerId: admin.id, categoryId: used.id, deletedAt: new Date() });
    const agent = await loginAs(admin);

    const res = await agent.get("/api/categories?includeInactive=true").expect(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({ name: "used", isActive: true, eventCount: 2 }),
      expect.objectContaining({ name: "inactive", isActive: false, eventCount: 0 }),
    ]);
  });

  it("admin でも includeInactive を指定しなければ有効のみで eventCount なし", async () => {
    await createCategory({ name: "active" });
    await createCategory({ name: "inactive", isActive: false });
    const agent = await adminAgent();

    const res = await agent.get("/api/categories").expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).not.toHaveProperty("eventCount");
  });

  it("includeInactive が許可値以外なら 400", async () => {
    const agent = await memberAgent();
    const res = await agent.get("/api/categories?includeInactive=yes").expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /api/categories (C2)", () => {
  it("member は 403", async () => {
    const agent = await memberAgent();
    const res = await agent.post("/api/categories").send({ name: "新カテゴリ" }).expect(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("admin は作成でき、201 で isActive: true を返す(前後空白は除去)", async () => {
    const agent = await adminAgent();
    const res = await agent
      .post("/api/categories")
      .send({ name: "  ハッカソン  ", sortOrder: 5 })
      .expect(201);
    expect(res.body.data).toEqual({
      id: expect.any(String),
      name: "ハッカソン",
      sortOrder: 5,
      isActive: true,
    });
  });

  it("sortOrder の既定は 0", async () => {
    const agent = await adminAgent();
    const res = await agent.post("/api/categories").send({ name: "研修" }).expect(201);
    expect(res.body.data.sortOrder).toBe(0);
  });

  it("「勉強会」と同名は 409 CATEGORY_NAME_TAKEN", async () => {
    await createCategory({ name: "勉強会" });
    const agent = await adminAgent();
    const res = await agent.post("/api/categories").send({ name: "勉強会" }).expect(409);
    expect(res.body.error.code).toBe("CATEGORY_NAME_TAKEN");
  });

  it("大文字小文字だけ違う名前(無効カテゴリ含む)も 409", async () => {
    await createCategory({ name: "React勉強会", isActive: false });
    const agent = await adminAgent();
    const res = await agent.post("/api/categories").send({ name: "react勉強会" }).expect(409);
    expect(res.body.error.code).toBe("CATEGORY_NAME_TAKEN");
  });

  it("名前が空・30 文字超、sortOrder が範囲外なら 400", async () => {
    const agent = await adminAgent();
    const empty = await agent.post("/api/categories").send({ name: "  " }).expect(400);
    expect(empty.body.error.details[0].field).toBe("name");
    await agent
      .post("/api/categories")
      .send({ name: "a".repeat(31) })
      .expect(400);
    const range = await agent
      .post("/api/categories")
      .send({ name: "x", sortOrder: 1000 })
      .expect(400);
    expect(range.body.error.details[0].field).toBe("sortOrder");
  });
});

describe("PATCH /api/categories/:categoryId (C3)", () => {
  it("member は 403", async () => {
    const category = await createCategory();
    const agent = await memberAgent();
    const res = await agent.patch(`/api/categories/${category.id}`).send({ name: "x" }).expect(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("名前・表示順を変更し、isActive を切り替えられる", async () => {
    const category = await createCategory({ name: "old" });
    const agent = await adminAgent();

    const renamed = await agent
      .patch(`/api/categories/${category.id}`)
      .send({ name: "new", sortOrder: 3 })
      .expect(200);
    expect(renamed.body.data).toEqual({
      id: category.id,
      name: "new",
      sortOrder: 3,
      isActive: true,
    });

    const off = await agent
      .patch(`/api/categories/${category.id}`)
      .send({ isActive: false })
      .expect(200);
    expect(off.body.data.isActive).toBe(false);
    const on = await agent
      .patch(`/api/categories/${category.id}`)
      .send({ isActive: true })
      .expect(200);
    expect(on.body.data.isActive).toBe(true);
  });

  it("自分自身の名前の大文字小文字だけを変えるのは許可する", async () => {
    const category = await createCategory({ name: "React" });
    const agent = await adminAgent();
    const res = await agent
      .patch(`/api/categories/${category.id}`)
      .send({ name: "REACT" })
      .expect(200);
    expect(res.body.data.name).toBe("REACT");
  });

  it("他のカテゴリと大文字小文字違いで重複する名前は 409", async () => {
    await createCategory({ name: "Study" });
    const category = await createCategory({ name: "other" });
    const agent = await adminAgent();
    const res = await agent
      .patch(`/api/categories/${category.id}`)
      .send({ name: "study" })
      .expect(409);
    expect(res.body.error.code).toBe("CATEGORY_NAME_TAKEN");
  });

  it("存在しないカテゴリは 404、項目なし・不正な ID は 400", async () => {
    const category = await createCategory();
    const agent = await adminAgent();
    const missing = await agent
      .patch(`/api/categories/${MISSING_ID}`)
      .send({ name: "x" })
      .expect(404);
    expect(missing.body.error.code).toBe("NOT_FOUND");
    await agent.patch(`/api/categories/${category.id}`).send({}).expect(400);
    await agent.patch("/api/categories/not-a-cuid").send({ name: "x" }).expect(400);
  });
});

describe("DELETE /api/categories/:categoryId (C4)", () => {
  it("member は 403", async () => {
    const category = await createCategory();
    const agent = await memberAgent();
    const res = await agent.delete(`/api/categories/${category.id}`).expect(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("未使用のカテゴリは物理削除して 204", async () => {
    const category = await createCategory();
    const agent = await adminAgent();
    await agent.delete(`/api/categories/${category.id}`).expect(204);
    expect(await prisma.category.findUnique({ where: { id: category.id } })).toBeNull();
  });

  it("使用中(論理削除済みイベントを含む)は 409 CATEGORY_IN_USE で件数を含む", async () => {
    const admin = await createUser({ email: "admin@example.com", role: "ADMIN" });
    const category = await createCategory();
    await createEvent({ organizerId: admin.id, categoryId: category.id });
    await createEvent({ organizerId: admin.id, categoryId: category.id, deletedAt: new Date() });
    const agent = await loginAs(admin);

    const res = await agent.delete(`/api/categories/${category.id}`).expect(409);
    expect(res.body.error.code).toBe("CATEGORY_IN_USE");
    expect(res.body.error.message).toContain("2");
    expect(res.body.error.message).toContain("無効化");
    expect(await prisma.category.findUnique({ where: { id: category.id } })).not.toBeNull();
  });

  it("論理削除済みイベントだけが使うカテゴリも削除できない", async () => {
    const admin = await createUser({ email: "admin@example.com", role: "ADMIN" });
    const category = await createCategory();
    await createEvent({ organizerId: admin.id, categoryId: category.id, deletedAt: new Date() });
    const agent = await loginAs(admin);
    await agent.delete(`/api/categories/${category.id}`).expect(409);
  });

  it("存在しないカテゴリは 404、不正な ID は 400", async () => {
    const agent = await adminAgent();
    const res = await agent.delete(`/api/categories/${MISSING_ID}`).expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    await agent.delete("/api/categories/not-a-cuid").expect(400);
  });
});
