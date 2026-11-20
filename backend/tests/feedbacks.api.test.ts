import type { AttendanceStatus, Event, User } from "@prisma/client";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../src/lib/prisma.js";
import { app, createEvent, createUser, hoursFromNow, loginAs, resetDb } from "./helpers.js";

beforeEach(resetDb);

/** 終了済みイベント(3 時間前開始・1 時間前終了)を作る */
function createEndedEvent(organizer: User): Promise<Event> {
  return createEvent({
    organizerId: organizer.id,
    startsAt: hoursFromNow(-3),
    endsAt: hoursFromNow(-1),
  });
}

/** 参加確定行を出席状態つきで直接作る */
async function attend(event: Event, user: User, attendance: AttendanceStatus = "PRESENT") {
  await prisma.registration.create({ data: { eventId: event.id, userId: user.id, attendance } });
}

/** フィードバック行を直接作る */
function createFeedbackRow(
  event: Event,
  user: User,
  data: { rating?: number; isAnonymous?: boolean; isHidden?: boolean; createdAt?: Date } = {},
) {
  return prisma.feedback.create({
    data: {
      eventId: event.id,
      userId: user.id,
      rating: data.rating ?? 4,
      comment: "よかった",
      isAnonymous: data.isAnonymous ?? false,
      isHidden: data.isHidden ?? false,
      createdAt: data.createdAt,
    },
  });
}

const body = { rating: 5, comment: "  楽しかった  " };

describe("POST /api/events/:eventId/feedback (F2)", () => {
  it("出席したユーザーは終了後に投稿でき、201 で自分の Feedback を返す", async () => {
    const organizer = await createUser();
    const member = await createUser({ name: "Bob" });
    const event = await createEndedEvent(organizer);
    await attend(event, member);
    const agent = await loginAs(member);

    const res = await agent.post(`/api/events/${event.id}/feedback`).send(body).expect(201);
    expect(res.body.data).toMatchObject({
      rating: 5,
      comment: "楽しかった",
      isAnonymous: false,
      isHidden: false,
      isMine: true,
      author: { id: member.id, name: "Bob" },
    });
  });

  it("匿名投稿は本人にも author: null で返す", async () => {
    const organizer = await createUser();
    const member = await createUser();
    const event = await createEndedEvent(organizer);
    await attend(event, member);
    const agent = await loginAs(member);

    const res = await agent
      .post(`/api/events/${event.id}/feedback`)
      .send({ ...body, isAnonymous: true })
      .expect(201);
    expect(res.body.data.author).toBeNull();
    expect(res.body.data.isMine).toBe(true);
  });

  it("開催終了前は 403 FEEDBACK_NOT_ALLOWED", async () => {
    const organizer = await createUser();
    const member = await createUser();
    const event = await createEvent({
      organizerId: organizer.id,
      startsAt: hoursFromNow(-1),
      endsAt: hoursFromNow(1),
    });
    await attend(event, member);
    const agent = await loginAs(member);

    const res = await agent.post(`/api/events/${event.id}/feedback`).send(body).expect(403);
    expect(res.body.error.code).toBe("FEEDBACK_NOT_ALLOWED");
    expect(res.body.error.message).toMatch(/終了後/);
  });

  it.each(["ABSENT", "UNMARKED"] as const)("出席が %s なら 403", async (attendance) => {
    const organizer = await createUser();
    const member = await createUser();
    const event = await createEndedEvent(organizer);
    await attend(event, member, attendance);
    const agent = await loginAs(member);

    const res = await agent.post(`/api/events/${event.id}/feedback`).send(body).expect(403);
    expect(res.body.error.code).toBe("FEEDBACK_NOT_ALLOWED");
    expect(res.body.error.message).toMatch(/出席/);
  });

  it("未登録なら 403", async () => {
    const organizer = await createUser();
    const member = await createUser();
    const event = await createEndedEvent(organizer);
    const agent = await loginAs(member);

    const res = await agent.post(`/api/events/${event.id}/feedback`).send(body).expect(403);
    expect(res.body.error.code).toBe("FEEDBACK_NOT_ALLOWED");
  });

  it("主催者は 403", async () => {
    const organizer = await createUser();
    const event = await createEndedEvent(organizer);
    const agent = await loginAs(organizer);

    const res = await agent.post(`/api/events/${event.id}/feedback`).send(body).expect(403);
    expect(res.body.error.code).toBe("FEEDBACK_NOT_ALLOWED");
    expect(res.body.error.message).toMatch(/主催者/);
  });

  it("2 件目は 409 FEEDBACK_ALREADY_EXISTS", async () => {
    const organizer = await createUser();
    const member = await createUser();
    const event = await createEndedEvent(organizer);
    await attend(event, member);
    const agent = await loginAs(member);

    await agent.post(`/api/events/${event.id}/feedback`).send(body).expect(201);
    const res = await agent.post(`/api/events/${event.id}/feedback`).send(body).expect(409);
    expect(res.body.error.code).toBe("FEEDBACK_ALREADY_EXISTS");
  });

  it("削除済みイベントは 404、入力不正は 400、未ログインは 401", async () => {
    const organizer = await createUser();
    const member = await createUser();
    const deleted = await createEvent({
      organizerId: organizer.id,
      startsAt: hoursFromNow(-3),
      endsAt: hoursFromNow(-1),
      deletedAt: new Date(),
    });
    await attend(deleted, member);
    const agent = await loginAs(member);

    await agent.post(`/api/events/${deleted.id}/feedback`).send(body).expect(404);
    const invalid = await agent
      .post(`/api/events/${deleted.id}/feedback`)
      .send({ rating: 6, comment: "" })
      .expect(400);
    expect(invalid.body.error.code).toBe("VALIDATION_ERROR");
    await request(app).post(`/api/events/${deleted.id}/feedback`).send(body).expect(401);
  });
});

describe("GET /api/events/:eventId/feedbacks (F1)", () => {
  it("匿名投稿の投稿者は member には null、admin には見える", async () => {
    const organizer = await createUser();
    const author = await createUser({ name: "Anon" });
    const viewer = await createUser();
    const admin = await createUser({ role: "ADMIN" });
    const event = await createEndedEvent(organizer);
    await createFeedbackRow(event, author, { isAnonymous: true });

    const asMember = await (
      await loginAs(viewer)
    )
      .get(`/api/events/${event.id}/feedbacks`)
      .expect(200);
    expect(asMember.body.data.items[0].author).toBeNull();
    expect(asMember.body.data.items[0].isMine).toBe(false);

    const asAdmin = await (
      await loginAs(admin)
    )
      .get(`/api/events/${event.id}/feedbacks`)
      .expect(200);
    expect(asAdmin.body.data.items[0].author).toEqual({ id: author.id, name: "Anon" });
  });

  it("非公開レビューは平均・件数・member の一覧から除外され、本人の myFeedback には出る", async () => {
    const organizer = await createUser();
    const [a, b, hiddenAuthor] = await Promise.all([createUser(), createUser(), createUser()]);
    const admin = await createUser({ role: "ADMIN" });
    const event = await createEndedEvent(organizer);
    await createFeedbackRow(event, a, { rating: 5 });
    await createFeedbackRow(event, b, { rating: 4 });
    await createFeedbackRow(event, hiddenAuthor, { rating: 1, isHidden: true });

    const asMember = await (await loginAs(a)).get(`/api/events/${event.id}/feedbacks`).expect(200);
    expect(asMember.body.data.rating).toEqual({ average: 4.5, count: 2 });
    expect(asMember.body.data.total).toBe(2);
    expect(asMember.body.data.items).toHaveLength(2);
    expect(asMember.body.data.myFeedback).toMatchObject({ rating: 5, isMine: true });

    const asHidden = await (
      await loginAs(hiddenAuthor)
    )
      .get(`/api/events/${event.id}/feedbacks`)
      .expect(200);
    expect(asHidden.body.data.items).toHaveLength(2);
    expect(asHidden.body.data.myFeedback).toMatchObject({
      rating: 1,
      isHidden: true,
      isMine: true,
    });

    const asAdmin = await (
      await loginAs(admin)
    )
      .get(`/api/events/${event.id}/feedbacks`)
      .expect(200);
    expect(asAdmin.body.data.rating).toEqual({ average: 4.5, count: 2 });
    expect(asAdmin.body.data.total).toBe(3);
    expect(asAdmin.body.data.myFeedback).toBeNull();
  });

  it("平均は小数第 1 位に丸め、0 件なら null。新しい順にページングする", async () => {
    const organizer = await createUser();
    const [a, b, c] = await Promise.all([createUser(), createUser(), createUser()]);
    const event = await createEndedEvent(organizer);
    const agent = await loginAs(a);

    const empty = await agent.get(`/api/events/${event.id}/feedbacks`).expect(200);
    expect(empty.body.data).toMatchObject({
      rating: { average: null, count: 0 },
      myFeedback: null,
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });

    const oldest = await createFeedbackRow(event, a, { rating: 5, createdAt: hoursFromNow(-0.9) });
    const middle = await createFeedbackRow(event, b, { rating: 4, createdAt: hoursFromNow(-0.5) });
    const newest = await createFeedbackRow(event, c, { rating: 4, createdAt: hoursFromNow(-0.1) });

    const page1 = await agent.get(`/api/events/${event.id}/feedbacks?limit=2`).expect(200);
    expect(page1.body.data.rating).toEqual({ average: 4.3, count: 3 });
    expect(page1.body.data.total).toBe(3);
    expect(page1.body.data.items.map((f: { id: string }) => f.id)).toEqual([newest.id, middle.id]);

    const page2 = await agent.get(`/api/events/${event.id}/feedbacks?limit=2&page=2`).expect(200);
    expect(page2.body.data.items.map((f: { id: string }) => f.id)).toEqual([oldest.id]);
  });

  it("削除済みイベントは 404", async () => {
    const organizer = await createUser();
    const event = await createEvent({ organizerId: organizer.id, deletedAt: new Date() });
    const res = await (
      await loginAs(organizer)
    )
      .get(`/api/events/${event.id}/feedbacks`)
      .expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("PATCH /api/events/:eventId/feedback (F3)", () => {
  it("自分の投稿を編集できる", async () => {
    const organizer = await createUser();
    const member = await createUser();
    const event = await createEndedEvent(organizer);
    await attend(event, member);
    await createFeedbackRow(event, member, { rating: 2 });

    const res = await (
      await loginAs(member)
    )
      .patch(`/api/events/${event.id}/feedback`)
      .send({ rating: 3, isAnonymous: true })
      .expect(200);
    expect(res.body.data).toMatchObject({
      rating: 3,
      comment: "よかった",
      isAnonymous: true,
      author: null,
      isMine: true,
    });
  });

  it("投稿後に欠席へ変わったら 403 FEEDBACK_NOT_ALLOWED", async () => {
    const organizer = await createUser();
    const member = await createUser();
    const event = await createEndedEvent(organizer);
    await attend(event, member, "ABSENT");
    await createFeedbackRow(event, member);

    const res = await (
      await loginAs(member)
    )
      .patch(`/api/events/${event.id}/feedback`)
      .send({ rating: 3 })
      .expect(403);
    expect(res.body.error.code).toBe("FEEDBACK_NOT_ALLOWED");
  });

  it("非公開のまま編集しても非公開状態は変わらない", async () => {
    const organizer = await createUser();
    const member = await createUser();
    const admin = await createUser({ role: "ADMIN" });
    const event = await createEndedEvent(organizer);
    await attend(event, member);
    const feedback = await createFeedbackRow(event, member);
    const hiddenAt = new Date();
    await prisma.feedback.update({
      where: { id: feedback.id },
      data: { isHidden: true, hiddenAt, hiddenById: admin.id },
    });

    const res = await (
      await loginAs(member)
    )
      .patch(`/api/events/${event.id}/feedback`)
      .send({ comment: "書き直した" })
      .expect(200);
    expect(res.body.data).toMatchObject({ comment: "書き直した", isHidden: true });

    const row = await prisma.feedback.findUniqueOrThrow({ where: { id: feedback.id } });
    expect(row.isHidden).toBe(true);
    expect(row.hiddenAt).toEqual(hiddenAt);
    expect(row.hiddenById).toBe(admin.id);
  });

  it("自分の投稿が無ければ 404、空の body は 400", async () => {
    const organizer = await createUser();
    const member = await createUser();
    const event = await createEndedEvent(organizer);
    await attend(event, member);
    const agent = await loginAs(member);

    const res = await agent
      .patch(`/api/events/${event.id}/feedback`)
      .send({ rating: 3 })
      .expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    await agent.patch(`/api/events/${event.id}/feedback`).send({}).expect(400);
  });
});

describe("PATCH /api/feedbacks/:feedbackId/visibility (F4)", () => {
  it("member は 403 FORBIDDEN", async () => {
    const organizer = await createUser();
    const member = await createUser();
    const event = await createEndedEvent(organizer);
    const feedback = await createFeedbackRow(event, member);

    const res = await (
      await loginAs(member)
    )
      .patch(`/api/feedbacks/${feedback.id}/visibility`)
      .send({ isHidden: true })
      .expect(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("admin は非公開化・再公開でき、同じ状態の指定も成功する", async () => {
    const organizer = await createUser();
    const member = await createUser({ name: "Anon" });
    const admin = await createUser({ role: "ADMIN" });
    const event = await createEndedEvent(organizer);
    const feedback = await createFeedbackRow(event, member, { isAnonymous: true });
    const agent = await loginAs(admin);
    const url = `/api/feedbacks/${feedback.id}/visibility`;

    const hidden = await agent.patch(url).send({ isHidden: true }).expect(200);
    expect(hidden.body.data).toMatchObject({
      isHidden: true,
      author: { id: member.id, name: "Anon" },
      isMine: false,
    });
    let row = await prisma.feedback.findUniqueOrThrow({ where: { id: feedback.id } });
    expect(row.hiddenAt).not.toBeNull();
    expect(row.hiddenById).toBe(admin.id);

    await agent.patch(url).send({ isHidden: true }).expect(200);

    const shown = await agent.patch(url).send({ isHidden: false }).expect(200);
    expect(shown.body.data.isHidden).toBe(false);
    row = await prisma.feedback.findUniqueOrThrow({ where: { id: feedback.id } });
    expect(row.hiddenAt).toBeNull();
    expect(row.hiddenById).toBeNull();
  });

  it("削除済みイベントのレビューは 404", async () => {
    const organizer = await createUser();
    const member = await createUser();
    const admin = await createUser({ role: "ADMIN" });
    const event = await createEvent({
      organizerId: organizer.id,
      startsAt: hoursFromNow(-3),
      endsAt: hoursFromNow(-1),
      deletedAt: new Date(),
    });
    const feedback = await createFeedbackRow(event, member);

    const res = await (
      await loginAs(admin)
    )
      .patch(`/api/feedbacks/${feedback.id}/visibility`)
      .send({ isHidden: true })
      .expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
