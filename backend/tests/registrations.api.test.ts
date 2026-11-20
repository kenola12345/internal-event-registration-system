import type { Event, User } from "@prisma/client";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../src/lib/prisma.js";
import { app, createEvent, createUser, hoursFromNow, loginAs, resetDb } from "./helpers.js";

beforeEach(resetDb);

/** 参加確定行を DB に直接作る */
async function register(event: Event, user: User) {
  return prisma.registration.create({ data: { eventId: event.id, userId: user.id } });
}

/** 待機行を DB に直接作る */
async function joinWaitlist(event: Event, user: User, position: number) {
  return prisma.waitlistEntry.create({ data: { eventId: event.id, userId: user.id, position } });
}

/** 主催者・参加者用のユーザーとイベントを用意する */
async function setup(eventOptions: Partial<Parameters<typeof createEvent>[0]> = {}) {
  const organizer = await createUser({ name: "Organizer" });
  const member = await createUser({ name: "Member" });
  const event = await createEvent({ organizerId: organizer.id, ...eventOptions });
  return { organizer, member, event };
}

describe("POST /api/events/:eventId/registration (R1)", () => {
  it("空きがあれば 201 で登録し、登録後のイベント詳細を返す", async () => {
    const { member, event } = await setup({ capacity: 2 });
    const agent = await loginAs(member);

    const res = await agent.post(`/api/events/${event.id}/registration`).expect(201);

    expect(res.body.data.registrationId).toEqual(expect.any(String));
    expect(res.body.data.event.myStatus).toEqual({ kind: "REGISTERED" });
    expect(res.body.data.event.registeredCount).toBe(1);
    expect(res.body.data.event.remainingSeats).toBe(1);
    expect(res.body.data.event.participants).toEqual([{ id: member.id, name: "Member" }]);
    expect(res.body.data.event.permissions.canCancel).toBe(true);
    const row = await prisma.registration.findUniqueOrThrow({
      where: { id: res.body.data.registrationId },
    });
    expect(row.attendance).toBe("UNMARKED");
  });

  it("未ログインは 401", async () => {
    const { event } = await setup();
    const res = await request(app).post(`/api/events/${event.id}/registration`).expect(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("eventId が cuid 形式でなければ 400", async () => {
    const { member } = await setup();
    const agent = await loginAs(member);
    const res = await agent.post("/api/events/not-a-cuid/registration").expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("存在しない・論理削除済みのイベントは 404", async () => {
    const { organizer, member } = await setup();
    const deleted = await createEvent({ organizerId: organizer.id, deletedAt: new Date() });
    const agent = await loginAs(member);
    const res = await agent.post(`/api/events/${deleted.id}/registration`).expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("満席なら 409 EVENT_FULL", async () => {
    const { member, event } = await setup({ capacity: 1 });
    await register(event, await createUser());
    const agent = await loginAs(member);
    const res = await agent.post(`/api/events/${event.id}/registration`).expect(409);
    expect(res.body.error.code).toBe("EVENT_FULL");
  });

  it("登録締切後は 409 REGISTRATION_CLOSED", async () => {
    const { member, event } = await setup({ registrationDeadline: hoursFromNow(-1) });
    const agent = await loginAs(member);
    const res = await agent.post(`/api/events/${event.id}/registration`).expect(409);
    expect(res.body.error.code).toBe("REGISTRATION_CLOSED");
  });

  it("開催開始後は 409 REGISTRATION_CLOSED", async () => {
    const { member, event } = await setup({ startsAt: hoursFromNow(-1) });
    const agent = await loginAs(member);
    const res = await agent.post(`/api/events/${event.id}/registration`).expect(409);
    expect(res.body.error.code).toBe("REGISTRATION_CLOSED");
  });

  it("二重登録は 409 ALREADY_REGISTERED", async () => {
    const { member, event } = await setup();
    await register(event, member);
    const agent = await loginAs(member);
    const res = await agent.post(`/api/events/${event.id}/registration`).expect(409);
    expect(res.body.error.code).toBe("ALREADY_REGISTERED");
  });

  it("キャンセル待ち中の登録は 409 ALREADY_REGISTERED", async () => {
    const { member, event } = await setup();
    await joinWaitlist(event, member, 1);
    const agent = await loginAs(member);
    const res = await agent.post(`/api/events/${event.id}/registration`).expect(409);
    expect(res.body.error.code).toBe("ALREADY_REGISTERED");
  });

  it("主催者は 403 ORGANIZER_CANNOT_REGISTER(締切後でも主催者判定が先)", async () => {
    const { organizer, event } = await setup({ startsAt: hoursFromNow(-1) });
    const agent = await loginAs(organizer);
    const res = await agent.post(`/api/events/${event.id}/registration`).expect(403);
    expect(res.body.error.code).toBe("ORGANIZER_CANNOT_REGISTER");
  });
});

describe("DELETE /api/events/:eventId/registration (R2)", () => {
  it("期限前なら 204 で参加確定行を削除する", async () => {
    const { member, event } = await setup();
    await register(event, member);
    const agent = await loginAs(member);

    await agent.delete(`/api/events/${event.id}/registration`).expect(204);

    expect(await prisma.registration.count({ where: { eventId: event.id } })).toBe(0);
  });

  it("キャンセル期限後は 409 CANCEL_DEADLINE_PASSED", async () => {
    const { member, event } = await setup({ cancelDeadline: hoursFromNow(-1) });
    await register(event, member);
    const agent = await loginAs(member);
    const res = await agent.delete(`/api/events/${event.id}/registration`).expect(409);
    expect(res.body.error.code).toBe("CANCEL_DEADLINE_PASSED");
    expect(await prisma.registration.count({ where: { eventId: event.id } })).toBe(1);
  });

  it("未登録(キャンセル待ちのみを含む)は 404", async () => {
    const { member, event } = await setup();
    await joinWaitlist(event, member, 1);
    const agent = await loginAs(member);
    const res = await agent.delete(`/api/events/${event.id}/registration`).expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("キャンセルで先頭の待機者が繰り上がり、CANCELLATION の履歴が残る", async () => {
    const { member, event } = await setup({ capacity: 1 });
    await register(event, member);
    const first = await createUser();
    const second = await createUser();
    await joinWaitlist(event, first, 3);
    await joinWaitlist(event, second, 5);
    const agent = await loginAs(member);

    await agent.delete(`/api/events/${event.id}/registration`).expect(204);

    const registrations = await prisma.registration.findMany({ where: { eventId: event.id } });
    expect(registrations.map((r) => r.userId)).toEqual([first.id]);
    const waitlist = await prisma.waitlistEntry.findMany({ where: { eventId: event.id } });
    // 他の待機者の position は振り直さない
    expect(waitlist.map((w) => [w.userId, w.position])).toEqual([[second.id, 5]]);
    const promotions = await prisma.waitlistPromotion.findMany({ where: { eventId: event.id } });
    expect(promotions).toHaveLength(1);
    expect(promotions[0]).toMatchObject({
      promotedUserId: first.id,
      vacatedByUserId: member.id,
      trigger: "CANCELLATION",
      waitlistPosition: 3,
    });
  });

  it("キャンセル後は再登録できる", async () => {
    const { member, event } = await setup();
    await register(event, member);
    const agent = await loginAs(member);
    await agent.delete(`/api/events/${event.id}/registration`).expect(204);
    await agent.post(`/api/events/${event.id}/registration`).expect(201);
  });
});

describe("同時リクエスト(イベント行ロックによる直列化)", () => {
  it("満席イベントで同時キャンセル 2 件 → 待機者 2 人がそれぞれ 1 回だけ繰り上がり、定員を超えない", async () => {
    const { event } = await setup({ capacity: 2 });
    const a = await createUser();
    const b = await createUser();
    const w1 = await createUser();
    const w2 = await createUser();
    const w3 = await createUser();
    await register(event, a);
    await register(event, b);
    await joinWaitlist(event, w1, 1);
    await joinWaitlist(event, w2, 2);
    await joinWaitlist(event, w3, 3);
    const [agentA, agentB] = await Promise.all([loginAs(a), loginAs(b)]);

    const results = await Promise.all([
      agentA.delete(`/api/events/${event.id}/registration`),
      agentB.delete(`/api/events/${event.id}/registration`),
    ]);

    expect(results.map((r) => r.status)).toEqual([204, 204]);
    const registrations = await prisma.registration.findMany({ where: { eventId: event.id } });
    expect(registrations.map((r) => r.userId).sort()).toEqual([w1.id, w2.id].sort());
    const promotions = await prisma.waitlistPromotion.findMany({ where: { eventId: event.id } });
    expect(promotions.map((p) => p.promotedUserId).sort()).toEqual([w1.id, w2.id].sort());
    const waitlist = await prisma.waitlistEntry.findMany({ where: { eventId: event.id } });
    expect(waitlist.map((w) => w.userId)).toEqual([w3.id]);
  });

  it("空き 1 席への同時登録 2 件 → 1 件だけ成功し、もう 1 件は 409 EVENT_FULL", async () => {
    const { event } = await setup({ capacity: 1 });
    const a = await createUser();
    const b = await createUser();
    const [agentA, agentB] = await Promise.all([loginAs(a), loginAs(b)]);

    const results = await Promise.all([
      agentA.post(`/api/events/${event.id}/registration`),
      agentB.post(`/api/events/${event.id}/registration`),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const failed = results.find((r) => r.status === 409);
    expect(failed?.body.error.code).toBe("EVENT_FULL");
    expect(await prisma.registration.count({ where: { eventId: event.id } })).toBe(1);
  });

  it("同じユーザーの同時登録 2 件 → 1 件だけ成功し、もう 1 件は 409 ALREADY_REGISTERED", async () => {
    const { member, event } = await setup();
    const agent = await loginAs(member);

    const results = await Promise.all([
      agent.post(`/api/events/${event.id}/registration`),
      agent.post(`/api/events/${event.id}/registration`),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)?.body.error.code).toBe("ALREADY_REGISTERED");
  });
});

describe("GET /api/events/:eventId/registrations (R3)", () => {
  it("主催者は参加確定者(登録順)・待機者(順位)・集計を取得できる", async () => {
    const { organizer, event } = await setup({ capacity: 2 });
    const a = await createUser({ name: "A" });
    const b = await createUser({ name: "B" });
    const w1 = await createUser({ name: "W1" });
    const w2 = await createUser({ name: "W2" });
    const regA = await register(event, a);
    const regB = await register(event, b);
    await prisma.registration.update({
      where: { id: regB.id },
      data: { attendance: "PRESENT", attendanceMarkedAt: new Date() },
    });
    // position が飛んでいても、順位は 1, 2 と並び順から付く
    const e2 = await joinWaitlist(event, w2, 7);
    const e1 = await joinWaitlist(event, w1, 4);
    const agent = await loginAs(organizer);

    const res = await agent.get(`/api/events/${event.id}/registrations`).expect(200);

    const data = res.body.data;
    expect(data.registrations.map((r: { id: string }) => r.id)).toEqual([regA.id, regB.id]);
    expect(data.registrations[0]).toMatchObject({
      user: { id: a.id, name: "A" },
      attendance: "UNMARKED",
      attendanceMarkedAt: null,
      registeredAt: regA.createdAt.toISOString(),
    });
    expect(data.registrations[1].attendance).toBe("PRESENT");
    expect(data.waitlist).toEqual([
      { id: e1.id, user: { id: w1.id, name: "W1" }, rank: 1, joinedAt: e1.createdAt.toISOString() },
      { id: e2.id, user: { id: w2.id, name: "W2" }, rank: 2, joinedAt: e2.createdAt.toISOString() },
    ]);
    expect(data.summary).toEqual({ present: 1, absent: 0, unmarked: 1 });
  });

  it("admin は他人のイベントでも取得できる", async () => {
    const { event } = await setup();
    const admin = await createUser({ role: "ADMIN" });
    const agent = await loginAs(admin);
    const res = await agent.get(`/api/events/${event.id}/registrations`).expect(200);
    expect(res.body.data).toEqual({
      registrations: [],
      waitlist: [],
      summary: { present: 0, absent: 0, unmarked: 0 },
    });
  });

  it("主催者でも admin でもない member(参加者本人を含む)は 403", async () => {
    const { member, event } = await setup();
    await register(event, member);
    const agent = await loginAs(member);
    const res = await agent.get(`/api/events/${event.id}/registrations`).expect(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("論理削除済みのイベントは 404", async () => {
    const { organizer } = await setup();
    const deleted = await createEvent({ organizerId: organizer.id, deletedAt: new Date() });
    const agent = await loginAs(organizer);
    const res = await agent.get(`/api/events/${deleted.id}/registrations`).expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("DELETE /api/events/:eventId/registrations/:registrationId (R4)", () => {
  it("member は自分が主催するイベントでも 403", async () => {
    const { organizer, member, event } = await setup();
    const registration = await register(event, member);
    const agent = await loginAs(organizer);
    const res = await agent
      .delete(`/api/events/${event.id}/registrations/${registration.id}`)
      .expect(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(await prisma.registration.count()).toBe(1);
  });

  it("admin はキャンセル期限後でも強制キャンセルでき、ADMIN_CANCELLATION で先頭が繰り上がる", async () => {
    const { member, event } = await setup({ capacity: 1, cancelDeadline: hoursFromNow(-1) });
    const registration = await register(event, member);
    const waiter = await createUser();
    await joinWaitlist(event, waiter, 1);
    const admin = await createUser({ role: "ADMIN" });
    const agent = await loginAs(admin);

    await agent.delete(`/api/events/${event.id}/registrations/${registration.id}`).expect(204);

    const registrations = await prisma.registration.findMany({ where: { eventId: event.id } });
    expect(registrations.map((r) => r.userId)).toEqual([waiter.id]);
    const promotions = await prisma.waitlistPromotion.findMany({ where: { eventId: event.id } });
    expect(promotions).toHaveLength(1);
    expect(promotions[0]).toMatchObject({
      promotedUserId: waiter.id,
      vacatedByUserId: member.id,
      trigger: "ADMIN_CANCELLATION",
      waitlistPosition: 1,
    });
  });

  it("別イベントの registrationId は 404 で、削除されない", async () => {
    const { organizer, member, event } = await setup();
    const other = await createEvent({ organizerId: organizer.id });
    const otherRegistration = await register(other, member);
    const admin = await createUser({ role: "ADMIN" });
    const agent = await loginAs(admin);

    const res = await agent
      .delete(`/api/events/${event.id}/registrations/${otherRegistration.id}`)
      .expect(404);

    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(await prisma.registration.count({ where: { id: otherRegistration.id } })).toBe(1);
  });

  it("開催開始後は削除のみで繰り上げない", async () => {
    const { member, event } = await setup({ capacity: 1, startsAt: hoursFromNow(-1) });
    const registration = await register(event, member);
    const waiter = await createUser();
    await joinWaitlist(event, waiter, 1);
    const admin = await createUser({ role: "ADMIN" });
    const agent = await loginAs(admin);

    await agent.delete(`/api/events/${event.id}/registrations/${registration.id}`).expect(204);

    expect(await prisma.registration.count({ where: { eventId: event.id } })).toBe(0);
    expect(await prisma.waitlistEntry.count({ where: { eventId: event.id } })).toBe(1);
    expect(await prisma.waitlistPromotion.count()).toBe(0);
  });
});
