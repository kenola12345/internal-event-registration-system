import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../src/lib/prisma.js";
import { app, createEvent, createUser, loginAs, resetDb } from "./helpers.js";

beforeEach(resetDb);

async function setup() {
  const user = await createUser({ email: "member@example.com" });
  return { user, agent: await loginAs(user) };
}

describe("GET /api/tags (T1)", () => {
  it("未ログインは 401", async () => {
    const res = await request(app).get("/api/tags").expect(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("前方一致で絞り込み、使用件数の降順 → 名前順で返す", async () => {
    const { user, agent } = await setup();
    await createEvent({ organizerId: user.id, tags: ["react", "redux"] });
    await createEvent({ organizerId: user.id, tags: ["redux"] });
    await createEvent({ organizerId: user.id, tags: ["rust", "vue"] });

    const res = await agent.get("/api/tags?q=r").expect(200);
    expect(res.body.data).toEqual([
      { name: "redux", eventCount: 2 },
      { name: "react", eventCount: 1 },
      { name: "rust", eventCount: 1 },
    ]);
  });

  it("q は正規化してから検索する(「ＲＥＡ」で react が出る)", async () => {
    const { user, agent } = await setup();
    await createEvent({ organizerId: user.id, tags: ["react", "vue"] });

    const res = await agent.get(`/api/tags?q=${encodeURIComponent(" ＲＥＡ ")}`).expect(200);
    expect(res.body.data).toEqual([{ name: "react", eventCount: 1 }]);
  });

  it("論理削除済みイベントは使用件数に数えず、使用件数 0 のタグも最後尾に含める", async () => {
    const { user, agent } = await setup();
    await createEvent({ organizerId: user.id, tags: ["alive"] });
    await createEvent({ organizerId: user.id, tags: ["deleted"], deletedAt: new Date() });
    await prisma.tag.create({ data: { name: "unused" } });

    const res = await agent.get("/api/tags").expect(200);
    expect(res.body.data).toEqual([
      { name: "alive", eventCount: 1 },
      { name: "deleted", eventCount: 0 },
      { name: "unused", eventCount: 0 },
    ]);
  });

  it("% や _ はワイルドカードとして扱わない", async () => {
    const { user, agent } = await setup();
    await createEvent({ organizerId: user.id, tags: ["abc", "a_c"] });

    const res = await agent.get("/api/tags?q=a_").expect(200);
    expect(res.body.data.map((t: { name: string }) => t.name)).toEqual(["a_c"]);
    const percent = await agent.get("/api/tags?q=%25").expect(200);
    expect(percent.body.data).toEqual([]);
  });

  it("limit の既定は 10、指定すればその件数まで", async () => {
    const { agent } = await setup();
    await prisma.tag.createMany({
      data: Array.from({ length: 12 }, (_, i) => ({ name: `tag${String(i).padStart(2, "0")}` })),
    });

    const byDefault = await agent.get("/api/tags").expect(200);
    expect(byDefault.body.data).toHaveLength(10);
    const limited = await agent.get("/api/tags?limit=3").expect(200);
    expect(limited.body.data.map((t: { name: string }) => t.name)).toEqual([
      "tag00",
      "tag01",
      "tag02",
    ]);
  });

  it("q が 20 文字超、limit が範囲外なら 400", async () => {
    const { agent } = await setup();
    await agent.get(`/api/tags?q=${"a".repeat(21)}`).expect(400);
    await agent.get("/api/tags?limit=21").expect(400);
    const res = await agent.get("/api/tags?limit=0").expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});
