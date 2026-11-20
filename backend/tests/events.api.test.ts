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

const MISSING_ID = "c000000000000000000000000";

type Summary = { id: string; title: string; tags: string[] };

/** 参加確定者を DB に直接作る */
async function register(eventId: string, userId: string) {
  return prisma.registration.create({ data: { eventId, userId } });
}

/** 待機者を DB に直接作る */
async function waitlist(eventId: string, userId: string, position: number) {
  return prisma.waitlistEntry.create({ data: { eventId, userId, position } });
}

/** 作成 API に送る有効なボディ */
function validBody(categoryId: string, overrides: Record<string, unknown> = {}) {
  const startsAt = hoursFromNow(48);
  return {
    title: "勉強会",
    description: "説明",
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    capacity: 10,
    categoryId,
    ...overrides,
  };
}

function fieldsOf(body: { error: { details?: { field: string }[] } }): string[] {
  return (body.error.details ?? []).map((detail) => detail.field);
}

describe("認証", () => {
  it("未ログインは 401", async () => {
    await request(app).get("/api/events").expect(401);
    await request(app).post("/api/events").send({}).expect(401);
  });
});

describe("GET /api/events (E1)", () => {
  it("既定は開催前のみ・開催日昇順で、削除済みは出ない", async () => {
    const user = await createUser();
    const later = await createEvent({
      organizerId: user.id,
      title: "later",
      startsAt: hoursFromNow(72),
    });
    const sooner = await createEvent({
      organizerId: user.id,
      title: "sooner",
      startsAt: hoursFromNow(24),
    });
    await createEvent({ organizerId: user.id, title: "past", startsAt: hoursFromNow(-48) });
    await createEvent({ organizerId: user.id, title: "deleted", deletedAt: new Date() });

    const agent = await loginAs(user);
    const res = await agent.get("/api/events").expect(200);
    expect(res.body.data.items.map((e: Summary) => e.id)).toEqual([sooner.id, later.id]);
    expect(res.body.data).toMatchObject({ total: 2, page: 1, limit: 20 });
    expect(res.body.data.items[0].myStatus).toEqual({ kind: "ORGANIZER" });

    const withPast = await agent.get("/api/events?includePast=true&sort=startsAt_desc").expect(200);
    expect(withPast.body.data.items.map((e: Summary) => e.title)).toEqual([
      "later",
      "sooner",
      "past",
    ]);
  });

  it("キーワードはタイトル・説明の部分一致(大文字小文字無視)、% はワイルドカードにしない", async () => {
    const user = await createUser();
    await createEvent({ organizerId: user.id, title: "React 入門" });
    await createEvent({ organizerId: user.id, title: "100% 理解する Go" });
    await createEvent({ organizerId: user.id, title: "その他" });
    const agent = await loginAs(user);

    const react = await agent.get("/api/events").query({ q: "react" }).expect(200);
    expect(react.body.data.items.map((e: Summary) => e.title)).toEqual(["React 入門"]);
    const percent = await agent.get("/api/events").query({ q: "%" }).expect(200);
    expect(percent.body.data.items.map((e: Summary) => e.title)).toEqual(["100% 理解する Go"]);
    const underscore = await agent.get("/api/events").query({ q: "_" }).expect(200);
    expect(underscore.body.data.total).toBe(0);
  });

  it("カテゴリ・正規化したタグで絞り込み、存在しない categoryId は 0 件", async () => {
    const user = await createUser();
    const category = await createCategory();
    const inCategory = await createEvent({ organizerId: user.id, categoryId: category.id });
    const tagged = await createEvent({ organizerId: user.id, tags: ["react"] });
    const agent = await loginAs(user);

    const byCategory = await agent.get(`/api/events?categoryId=${category.id}`).expect(200);
    expect(byCategory.body.data.items.map((e: Summary) => e.id)).toEqual([inCategory.id]);
    const byTag = await agent.get("/api/events").query({ tag: " ＲＥＡＣＴ " }).expect(200);
    expect(byTag.body.data.items.map((e: Summary) => e.id)).toEqual([tagged.id]);
    expect(byTag.body.data.items[0].tags).toEqual(["react"]);
    const missing = await agent.get(`/api/events?categoryId=${MISSING_ID}`).expect(200);
    expect(missing.body.data).toMatchObject({ items: [], total: 0 });
  });

  it("同時刻は id 順に固定してページングし、total はページング前の件数", async () => {
    const user = await createUser();
    const startsAt = hoursFromNow(24);
    const ids: string[] = [];
    for (let i = 0; i < 3; i++)
      ids.push((await createEvent({ organizerId: user.id, startsAt })).id);
    ids.sort();
    const agent = await loginAs(user);

    const page2 = await agent.get("/api/events?page=2&limit=2").expect(200);
    expect(page2.body.data).toMatchObject({ total: 3, page: 2, limit: 2 });
    expect(page2.body.data.items.map((e: Summary) => e.id)).toEqual([ids[2]]);
  });

  it("不正なクエリは 400 VALIDATION_ERROR", async () => {
    const agent = await loginAs(await createUser());
    const res = await agent.get("/api/events?limit=51&sort=bad&categoryId=x").expect(400);
    expect(fieldsOf(res.body)).toEqual(expect.arrayContaining(["limit", "sort", "categoryId"]));
  });
});

describe("GET /api/events/:eventId (E2)", () => {
  it("閲覧者ごとの myStatus と permissions を返す", async () => {
    const organizer = await createUser();
    const registered = await createUser();
    const waiting = await createUser();
    const other = await createUser();
    const event = await createEvent({ organizerId: organizer.id, capacity: 1 });
    await register(event.id, registered.id);
    await waitlist(event.id, waiting.id, 1);

    const asOrganizer = await (await loginAs(organizer)).get(`/api/events/${event.id}`).expect(200);
    expect(asOrganizer.body.data.myStatus).toEqual({ kind: "ORGANIZER" });
    expect(asOrganizer.body.data.permissions).toMatchObject({ canEdit: true, canRegister: false });
    expect(asOrganizer.body.data.participants).toEqual([
      { id: registered.id, name: registered.name },
    ]);

    const asRegistered = await (
      await loginAs(registered)
    )
      .get(`/api/events/${event.id}`)
      .expect(200);
    expect(asRegistered.body.data.myStatus).toEqual({ kind: "REGISTERED" });
    expect(asRegistered.body.data.permissions).toMatchObject({ canEdit: false, canCancel: true });

    const asWaiting = await (await loginAs(waiting)).get(`/api/events/${event.id}`).expect(200);
    expect(asWaiting.body.data.myStatus).toEqual({ kind: "WAITLISTED", rank: 1 });
    expect(asWaiting.body.data.permissions.canLeaveWaitlist).toBe(true);

    const asOther = await (await loginAs(other)).get(`/api/events/${event.id}`).expect(200);
    expect(asOther.body.data.myStatus).toEqual({ kind: "NONE" });
    expect(asOther.body.data.permissions).toMatchObject({
      canEdit: false,
      canRegister: false,
      canJoinWaitlist: true,
    });
  });

  it("削除済み・存在しないイベントは 404、不正な ID は 400", async () => {
    const user = await createUser();
    const deleted = await createEvent({ organizerId: user.id, deletedAt: new Date() });
    const agent = await loginAs(user);
    const res = await agent.get(`/api/events/${deleted.id}`).expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    await agent.get(`/api/events/${MISSING_ID}`).expect(404);
    await agent.get("/api/events/not-an-id").expect(400);
  });
});

describe("POST /api/events (E3)", () => {
  it("ログインユーザーを主催者として作成し、ボディの organizerId は無視する。タグは正規化・重複除去", async () => {
    const user = await createUser();
    const someoneElse = await createUser();
    const category = await createCategory();
    const agent = await loginAs(user);

    const res = await agent
      .post("/api/events")
      .send(
        validBody(category.id, {
          organizerId: someoneElse.id,
          location: "",
          tags: [" React ", "ｒｅａｃｔ", "Type  Script"],
        }),
      )
      .expect(201);
    expect(res.body.data).toMatchObject({
      organizer: { id: user.id },
      myStatus: { kind: "ORGANIZER" },
      registeredCount: 0,
      participants: [],
      location: null,
      registrationDeadline: null,
    });
    expect(res.body.data.tags).toEqual(["react", "type script"]);
    const saved = await prisma.event.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(saved.organizerId).toBe(user.id);
  });

  it("過去の開始日時・終了 <= 開始・締切 > 開始・過去の締切は 400", async () => {
    const category = await createCategory();
    const agent = await loginAs(await createUser());
    const startsAt = hoursFromNow(48);

    const past = await agent
      .post("/api/events")
      .send(
        validBody(category.id, {
          startsAt: hoursFromNow(-1).toISOString(),
          endsAt: hoursFromNow(1).toISOString(),
        }),
      )
      .expect(400);
    expect(fieldsOf(past.body)).toEqual(["startsAt"]);

    const order = await agent
      .post("/api/events")
      .send(
        validBody(category.id, {
          startsAt: startsAt.toISOString(),
          endsAt: startsAt.toISOString(),
          registrationDeadline: hoursFromNow(49).toISOString(),
          cancelDeadline: hoursFromNow(49).toISOString(),
        }),
      )
      .expect(400);
    expect(fieldsOf(order.body)).toEqual(
      expect.arrayContaining(["endsAt", "registrationDeadline", "cancelDeadline"]),
    );

    const pastDeadline = await agent
      .post("/api/events")
      .send(validBody(category.id, { registrationDeadline: hoursFromNow(-1).toISOString() }))
      .expect(400);
    expect(fieldsOf(pastDeadline.body)).toEqual(["registrationDeadline"]);
  });

  it("無効化・存在しないカテゴリは 400(field: categoryId)", async () => {
    const inactive = await createCategory({ isActive: false });
    const agent = await loginAs(await createUser());
    for (const categoryId of [inactive.id, MISSING_ID]) {
      const res = await agent.post("/api/events").send(validBody(categoryId)).expect(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(fieldsOf(res.body)).toEqual(["categoryId"]);
    }
  });

  it("タグ 11 個以上・正規化後に空のタグは 400", async () => {
    const category = await createCategory();
    const agent = await loginAs(await createUser());
    const tooMany = Array.from({ length: 11 }, (_, i) => `t${String(i)}`);
    await agent
      .post("/api/events")
      .send(validBody(category.id, { tags: tooMany }))
      .expect(400);
    await agent
      .post("/api/events")
      .send(validBody(category.id, { tags: ["   "] }))
      .expect(400);
  });
});

describe("PATCH /api/events/:eventId (E4)", () => {
  it("主催者でも admin でもなければ 403、admin は編集できる", async () => {
    const organizer = await createUser();
    const event = await createEvent({ organizerId: organizer.id });
    const other = await loginAs(await createUser());
    const res = await other.patch(`/api/events/${event.id}`).send({ title: "x" }).expect(403);
    expect(res.body.error.code).toBe("FORBIDDEN");

    const admin = await loginAs(await createUser({ role: "ADMIN" }));
    const ok = await admin
      .patch(`/api/events/${event.id}`)
      .send({ title: "admin edit" })
      .expect(200);
    expect(ok.body.data).toMatchObject({ event: { title: "admin edit" }, warnings: [] });
  });

  it("空のボディ・削除済みイベントはエラー", async () => {
    const organizer = await createUser();
    const event = await createEvent({ organizerId: organizer.id });
    const deleted = await createEvent({ organizerId: organizer.id, deletedAt: new Date() });
    const agent = await loginAs(organizer);
    await agent.patch(`/api/events/${event.id}`).send({}).expect(400);
    await agent.patch(`/api/events/${deleted.id}`).send({ title: "x" }).expect(404);
  });

  it("開催開始後は日時・定員の変更が 409、同じ値の送信やタイトル変更は可", async () => {
    const organizer = await createUser();
    const event = await createEvent({ organizerId: organizer.id, startsAt: hoursFromNow(-1) });
    const agent = await loginAs(organizer);

    const started = await agent
      .patch(`/api/events/${event.id}`)
      .send({ startsAt: hoursFromNow(24).toISOString(), endsAt: hoursFromNow(26).toISOString() })
      .expect(409);
    expect(started.body.error.code).toBe("EVENT_ALREADY_STARTED");
    await agent.patch(`/api/events/${event.id}`).send({ capacity: 20 }).expect(409);

    await agent
      .patch(`/api/events/${event.id}`)
      .send({
        title: "開催後の修正",
        capacity: event.capacity,
        startsAt: event.startsAt.toISOString(),
      })
      .expect(200);
  });

  it("マージ後の前後関係・過去の開始日時・無効カテゴリは 400。無効化済みの現在カテゴリは変更しなければ保存できる", async () => {
    const organizer = await createUser();
    const category = await createCategory();
    const event = await createEvent({ organizerId: organizer.id, categoryId: category.id });
    const agent = await loginAs(organizer);

    const order = await agent
      .patch(`/api/events/${event.id}`)
      .send({ endsAt: hoursFromNow(1).toISOString() })
      .expect(400);
    expect(fieldsOf(order.body)).toEqual(["endsAt"]);

    const past = await agent
      .patch(`/api/events/${event.id}`)
      .send({ startsAt: hoursFromNow(-2).toISOString() })
      .expect(400);
    expect(fieldsOf(past.body)).toContain("startsAt");

    const inactive = await createCategory({ isActive: false });
    const badCategory = await agent
      .patch(`/api/events/${event.id}`)
      .send({ categoryId: inactive.id })
      .expect(400);
    expect(fieldsOf(badCategory.body)).toEqual(["categoryId"]);

    await prisma.category.update({ where: { id: category.id }, data: { isActive: false } });
    await agent
      .patch(`/api/events/${event.id}`)
      .send({ title: "変更", categoryId: category.id })
      .expect(200);
  });

  it("参加確定者数未満の定員は 409 CAPACITY_BELOW_REGISTERED", async () => {
    const organizer = await createUser();
    const event = await createEvent({ organizerId: organizer.id, capacity: 3 });
    for (let i = 0; i < 2; i++) await register(event.id, (await createUser()).id);
    const agent = await loginAs(organizer);

    const res = await agent.patch(`/api/events/${event.id}`).send({ capacity: 1 }).expect(409);
    expect(res.body.error.code).toBe("CAPACITY_BELOW_REGISTERED");
    await agent.patch(`/api/events/${event.id}`).send({ capacity: 2 }).expect(200);
  });

  it("定員を増やすと増えた枠の分だけ position 順に繰り上げ、WAITLIST_PROMOTED を返す", async () => {
    const organizer = await createUser();
    const event = await createEvent({ organizerId: organizer.id, capacity: 1 });
    await register(event.id, (await createUser()).id);
    const first = await createUser();
    const second = await createUser();
    const third = await createUser();
    await waitlist(event.id, second.id, 5);
    await waitlist(event.id, first.id, 2);
    await waitlist(event.id, third.id, 9);
    const agent = await loginAs(organizer);

    const res = await agent.patch(`/api/events/${event.id}`).send({ capacity: 3 }).expect(200);
    expect(res.body.data.warnings).toEqual([{ code: "WAITLIST_PROMOTED", promotedCount: 2 }]);
    expect(res.body.data.event).toMatchObject({
      capacity: 3,
      registeredCount: 3,
      waitlistCount: 1,
    });

    const promotions = await prisma.waitlistPromotion.findMany({
      orderBy: { waitlistPosition: "asc" },
    });
    expect(promotions.map((p) => [p.promotedUserId, p.trigger, p.vacatedByUserId])).toEqual([
      [first.id, "CAPACITY_INCREASE", null],
      [second.id, "CAPACITY_INCREASE", null],
    ]);
  });

  it("参加確定者がいる状態で日時を変えると scheduleChangedAt を記録し警告を返す。いなければ警告なし", async () => {
    const organizer = await createUser();
    const withParticipant = await createEvent({ organizerId: organizer.id });
    await register(withParticipant.id, (await createUser()).id);
    const empty = await createEvent({ organizerId: organizer.id });
    const agent = await loginAs(organizer);
    const newSchedule = {
      startsAt: hoursFromNow(96).toISOString(),
      endsAt: hoursFromNow(98).toISOString(),
    };

    const res = await agent
      .patch(`/api/events/${withParticipant.id}`)
      .send(newSchedule)
      .expect(200);
    expect(res.body.data.warnings).toEqual([
      { code: "SCHEDULE_CHANGED_WITH_PARTICIPANTS", participantCount: 1 },
    ]);
    expect(res.body.data.event.scheduleChangedAt).not.toBeNull();
    expect(res.body.data.event.startsAt).toBe(newSchedule.startsAt);

    const noWarning = await agent.patch(`/api/events/${empty.id}`).send(newSchedule).expect(200);
    expect(noWarning.body.data.warnings).toEqual([]);
    expect(noWarning.body.data.event.scheduleChangedAt).toBeNull();
  });

  it("タグを指定すると丸ごと置き換え、null で締切を未設定に戻せる", async () => {
    const organizer = await createUser();
    const event = await createEvent({
      organizerId: organizer.id,
      tags: ["old"],
      registrationDeadline: hoursFromNow(24),
    });
    const agent = await loginAs(organizer);

    const res = await agent
      .patch(`/api/events/${event.id}`)
      .send({ tags: ["New", "react"], registrationDeadline: null })
      .expect(200);
    expect(res.body.data.event.tags).toEqual(["new", "react"]);
    expect(res.body.data.event.registrationDeadline).toBeNull();
  });
});

describe("DELETE /api/events/:eventId (E5)", () => {
  it("主催者でも admin でもなければ 403", async () => {
    const event = await createEvent({ organizerId: (await createUser()).id });
    const other = await loginAs(await createUser());
    const res = await other.delete(`/api/events/${event.id}`).expect(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("主催者は削除でき、削除後は詳細・一覧から消え、二重削除は 404。参加行は残す", async () => {
    const organizer = await createUser();
    const event = await createEvent({ organizerId: organizer.id });
    await register(event.id, (await createUser()).id);
    const agent = await loginAs(organizer);

    await agent.delete(`/api/events/${event.id}`).expect(204);
    await agent.get(`/api/events/${event.id}`).expect(404);
    const list = await agent.get("/api/events").expect(200);
    expect(list.body.data.total).toBe(0);
    await agent.delete(`/api/events/${event.id}`).expect(404);
    expect(await prisma.registration.count({ where: { eventId: event.id } })).toBe(1);
  });

  it("admin は他人のイベントも削除できる(開催済みでも可)", async () => {
    const event = await createEvent({
      organizerId: (await createUser()).id,
      startsAt: hoursFromNow(-48),
    });
    const admin = await loginAs(await createUser({ role: "ADMIN" }));
    await admin.delete(`/api/events/${event.id}`).expect(204);
    const saved = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(saved.deletedAt).not.toBeNull();
  });
});
