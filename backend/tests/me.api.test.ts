import type { AttendanceStatus } from "@prisma/client";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../src/lib/prisma.js";
import {
  app,
  createCategory,
  createEvent,
  createUser,
  hoursFromNow,
  loginAs,
  resetDb,
} from "./helpers.js";

beforeEach(resetDb);

type Summary = { id: string; title: string; myStatus: { kind: string; rank?: number } };
type HistoryItem = Summary & { attendance: AttendanceStatus; hasFeedback: boolean };

const titles = (items: Summary[]) => items.map((item) => item.title);

/** 指定イベントに参加確定行を直接作る */
function register(userId: string, eventId: string, attendance: AttendanceStatus = "UNMARKED") {
  return prisma.registration.create({ data: { userId, eventId, attendance } });
}

describe("GET /api/me/events", () => {
  it("未ログインは 401 UNAUTHENTICATED", async () => {
    const res = await request(app).get("/api/me/events").expect(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("主催予定・主催済みを正しい区分と並び順で返し、削除済みは出さない", async () => {
    const me = await createUser();
    const other = await createUser();
    await createEvent({ organizerId: me.id, title: "主催-後", startsAt: hoursFromNow(72) });
    await createEvent({ organizerId: me.id, title: "主催-先", startsAt: hoursFromNow(24) });
    await createEvent({ organizerId: me.id, title: "主催済-古", startsAt: hoursFromNow(-72) });
    await createEvent({ organizerId: me.id, title: "主催済-新", startsAt: hoursFromNow(-24) });
    await createEvent({ organizerId: me.id, title: "削除済", deletedAt: new Date() });
    await createEvent({ organizerId: other.id, title: "他人の主催" });

    const res = await (await loginAs(me)).get("/api/me/events").expect(200);
    const data = res.body.data as Record<string, Summary[]>;
    expect(titles(data.organizing ?? [])).toEqual(["主催-先", "主催-後"]);
    expect(titles(data.organizedPast ?? [])).toEqual(["主催済-新", "主催済-古"]);
    expect(data.organizing?.[0]?.myStatus.kind).toBe("ORGANIZER");
    expect(data.registered).toEqual([]);
    expect(data.waitlisted).toEqual([]);
    expect(data.history).toEqual([]);
  });

  it("主催済みは最大 20 件", async () => {
    const me = await createUser();
    const category = await createCategory();
    for (let i = 1; i <= 21; i++) {
      await createEvent({
        organizerId: me.id,
        categoryId: category.id,
        title: `past-${String(i)}`,
        startsAt: hoursFromNow(-i),
      });
    }
    const res = await (await loginAs(me)).get("/api/me/events").expect(200);
    expect(res.body.data.organizedPast).toHaveLength(20);
    expect(res.body.data.organizedPast[0].title).toBe("past-1");
  });

  it("参加予定・キャンセル待ち(順位付き)を開催日昇順で返す", async () => {
    const me = await createUser();
    const organizer = await createUser();
    const ahead = await createUser();
    const later = await createEvent({
      organizerId: organizer.id,
      title: "参加-後",
      startsAt: hoursFromNow(72),
    });
    const sooner = await createEvent({
      organizerId: organizer.id,
      title: "参加-先",
      startsAt: hoursFromNow(24),
    });
    const deleted = await createEvent({ organizerId: organizer.id, deletedAt: new Date() });
    await register(me.id, later.id);
    await register(me.id, sooner.id);
    await register(me.id, deleted.id);

    const full = await createEvent({ organizerId: organizer.id, title: "待機", capacity: 1 });
    await prisma.waitlistEntry.create({
      data: { eventId: full.id, userId: ahead.id, position: 1 },
    });
    await prisma.waitlistEntry.create({ data: { eventId: full.id, userId: me.id, position: 2 } });
    const deletedWait = await createEvent({ organizerId: organizer.id, deletedAt: new Date() });
    await prisma.waitlistEntry.create({
      data: { eventId: deletedWait.id, userId: me.id, position: 1 },
    });

    const res = await (await loginAs(me)).get("/api/me/events").expect(200);
    const data = res.body.data as Record<string, Summary[]>;
    expect(titles(data.registered ?? [])).toEqual(["参加-先", "参加-後"]);
    expect(data.registered?.[0]?.myStatus.kind).toBe("REGISTERED");
    expect(titles(data.waitlisted ?? [])).toEqual(["待機"]);
    expect(data.waitlisted?.[0]?.myStatus).toEqual({ kind: "WAITLISTED", rank: 2 });
    expect(data.organizing).toEqual([]);
    expect(data.history).toEqual([]);
  });

  it("参加履歴は開催開始済みの参加確定を新しい順で、出席状態とレビュー有無付きで返す", async () => {
    const me = await createUser();
    const organizer = await createUser();
    const old = await createEvent({
      organizerId: organizer.id,
      title: "履歴-古",
      startsAt: hoursFromNow(-72),
    });
    const recent = await createEvent({
      organizerId: organizer.id,
      title: "履歴-新",
      startsAt: hoursFromNow(-24),
    });
    const deleted = await createEvent({
      organizerId: organizer.id,
      startsAt: hoursFromNow(-48),
      deletedAt: new Date(),
    });
    const future = await createEvent({ organizerId: organizer.id, title: "未来" });
    await register(me.id, old.id, "PRESENT");
    await register(me.id, recent.id, "ABSENT");
    await register(me.id, deleted.id, "PRESENT");
    await register(me.id, future.id);
    await prisma.feedback.create({
      data: { eventId: old.id, userId: me.id, rating: 5, comment: "良かった" },
    });

    const res = await (await loginAs(me)).get("/api/me/events").expect(200);
    const history = res.body.data.history as HistoryItem[];
    expect(titles(history)).toEqual(["履歴-新", "履歴-古"]);
    expect(history[0]).toMatchObject({ attendance: "ABSENT", hasFeedback: false });
    expect(history[1]).toMatchObject({ attendance: "PRESENT", hasFeedback: true });
    expect(titles(res.body.data.registered)).toEqual(["未来"]);
  });

  it("他人の参加登録は自分の区分に出ない", async () => {
    const me = await createUser();
    const other = await createUser();
    const organizer = await createUser();
    const event = await createEvent({ organizerId: organizer.id, startsAt: hoursFromNow(-24) });
    const upcoming = await createEvent({ organizerId: organizer.id });
    await register(other.id, event.id, "PRESENT");
    await register(other.id, upcoming.id);

    const res = await (await loginAs(me)).get("/api/me/events").expect(200);
    expect(res.body.data).toEqual({
      organizing: [],
      organizedPast: [],
      registered: [],
      waitlisted: [],
      history: [],
    });
  });
});

describe("GET /api/me/stats", () => {
  it("未ログインは 401 UNAUTHENTICATED", async () => {
    const res = await request(app).get("/api/me/stats").expect(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("参加がなければ 0 件・出席率 null・カテゴリ空", async () => {
    const me = await createUser();
    const res = await (await loginAs(me)).get("/api/me/stats").expect(200);
    expect(res.body.data).toEqual({
      participationCount: 0,
      presentCount: 0,
      absentCount: 0,
      unmarkedCount: 0,
      attendanceRate: null,
      byCategory: [],
    });
  });

  it("累計参加数に欠席を含めず、出席率は未マークを分母から除外する", async () => {
    const me = await createUser();
    const organizer = await createUser();
    const statuses: AttendanceStatus[] = ["PRESENT", "PRESENT", "PRESENT", "ABSENT", "UNMARKED"];
    for (const [i, attendance] of statuses.entries()) {
      const event = await createEvent({
        organizerId: organizer.id,
        startsAt: hoursFromNow(-1 - i),
      });
      await register(me.id, event.id, attendance);
    }
    // 母集団外: 未開催・削除済み・自分が主催したイベント
    const future = await createEvent({ organizerId: organizer.id });
    await register(me.id, future.id);
    const deleted = await createEvent({
      organizerId: organizer.id,
      startsAt: hoursFromNow(-24),
      deletedAt: new Date(),
    });
    await register(me.id, deleted.id, "PRESENT");
    await createEvent({ organizerId: me.id, startsAt: hoursFromNow(-24) });

    const res = await (await loginAs(me)).get("/api/me/stats").expect(200);
    expect(res.body.data).toMatchObject({
      participationCount: 4,
      presentCount: 3,
      absentCount: 1,
      unmarkedCount: 1,
      attendanceRate: 0.75,
    });
  });

  it("全員未マークなら出席率は null", async () => {
    const me = await createUser();
    const organizer = await createUser();
    const event = await createEvent({ organizerId: organizer.id, startsAt: hoursFromNow(-1) });
    await register(me.id, event.id);

    const res = await (await loginAs(me)).get("/api/me/stats").expect(200);
    expect(res.body.data).toMatchObject({
      participationCount: 1,
      unmarkedCount: 1,
      attendanceRate: null,
    });
  });

  it("カテゴリ別は欠席を除いて件数降順・同数は sortOrder 昇順、無効カテゴリを含み 0 件は省く", async () => {
    const me = await createUser();
    const organizer = await createUser();
    const a = await createCategory({ name: "A", sortOrder: 3 });
    const b = await createCategory({ name: "B", sortOrder: 2 });
    const inactive = await createCategory({ name: "無効", sortOrder: 1, isActive: false });
    const absentOnly = await createCategory({ name: "欠席のみ", sortOrder: 0 });
    const rows: [string, AttendanceStatus][] = [
      [a.id, "PRESENT"],
      [a.id, "UNMARKED"],
      [a.id, "ABSENT"],
      [b.id, "PRESENT"],
      [inactive.id, "UNMARKED"],
      [absentOnly.id, "ABSENT"],
    ];
    for (const [i, [categoryId, attendance]] of rows.entries()) {
      const event = await createEvent({
        organizerId: organizer.id,
        categoryId,
        startsAt: hoursFromNow(-1 - i),
      });
      await register(me.id, event.id, attendance);
    }

    const res = await (await loginAs(me)).get("/api/me/stats").expect(200);
    const byCategory = res.body.data.byCategory as { category: { name: string }; count: number }[];
    expect(byCategory.map((row) => [row.category.name, row.count])).toEqual([
      ["A", 2],
      ["無効", 1],
      ["B", 1],
    ]);
    expect(res.body.data.byCategory[1].category).toMatchObject({ isActive: false, sortOrder: 1 });
  });
});
