import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../src/lib/prisma.js";
import { app, createEvent, createUser, hoursFromNow, loginAs, resetDb } from "./helpers.js";

beforeEach(resetDb);

/** 開催開始済み(既定)のイベントと参加確定者 1 人を用意する */
async function setup(startsAt = hoursFromNow(-1)) {
  const organizer = await createUser({ name: "Organizer" });
  const member = await createUser({ name: "Member" });
  const event = await createEvent({ organizerId: organizer.id, startsAt });
  const registration = await prisma.registration.create({
    data: { eventId: event.id, userId: member.id },
  });
  const url = `/api/events/${event.id}/registrations/${registration.id}/attendance`;
  return { organizer, member, event, registration, url };
}

describe("PUT /api/events/:eventId/registrations/:registrationId/attendance (R5)", () => {
  it("主催者は 出席 → 欠席 → 未マーク と変更でき、マーク日時・マーク者が設定・NULL 化される", async () => {
    const { organizer, registration, url } = await setup();
    const agent = await loginAs(organizer);

    const present = await agent.put(url).send({ status: "PRESENT" }).expect(200);
    expect(present.body.data).toEqual({
      id: registration.id,
      attendance: "PRESENT",
      attendanceMarkedAt: expect.any(String),
    });
    let row = await prisma.registration.findUniqueOrThrow({ where: { id: registration.id } });
    expect(row.attendanceMarkedById).toBe(organizer.id);
    expect(row.attendanceMarkedAt?.toISOString()).toBe(present.body.data.attendanceMarkedAt);

    const absent = await agent.put(url).send({ status: "ABSENT" }).expect(200);
    expect(absent.body.data.attendance).toBe("ABSENT");
    expect(absent.body.data.attendanceMarkedAt).toEqual(expect.any(String));

    const unmarked = await agent.put(url).send({ status: "UNMARKED" }).expect(200);
    expect(unmarked.body.data).toEqual({
      id: registration.id,
      attendance: "UNMARKED",
      attendanceMarkedAt: null,
    });
    row = await prisma.registration.findUniqueOrThrow({ where: { id: registration.id } });
    expect(row.attendanceMarkedAt).toBeNull();
    expect(row.attendanceMarkedById).toBeNull();
  });

  it("admin は他人のイベントでもマークでき、マーク者は admin になる", async () => {
    const { registration, url } = await setup();
    const admin = await createUser({ role: "ADMIN" });
    const agent = await loginAs(admin);
    await agent.put(url).send({ status: "PRESENT" }).expect(200);
    const row = await prisma.registration.findUniqueOrThrow({ where: { id: registration.id } });
    expect(row.attendanceMarkedById).toBe(admin.id);
  });

  it("開催開始前は 400 EVENT_NOT_STARTED", async () => {
    const { organizer, url } = await setup(hoursFromNow(24));
    const agent = await loginAs(organizer);
    const res = await agent.put(url).send({ status: "PRESENT" }).expect(400);
    expect(res.body.error.code).toBe("EVENT_NOT_STARTED");
  });

  it("主催者でも admin でもない member(参加者本人を含む)は 403(開催前でも権限判定が先)", async () => {
    const { member, url } = await setup(hoursFromNow(24));
    const agent = await loginAs(member);
    const res = await agent.put(url).send({ status: "PRESENT" }).expect(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("status が許可値以外なら 400 VALIDATION_ERROR", async () => {
    const { organizer, url } = await setup();
    const agent = await loginAs(organizer);
    const res = await agent.put(url).send({ status: "LATE" }).expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("別イベントの registrationId は 404", async () => {
    const { organizer, event, member } = await setup();
    const other = await createEvent({ organizerId: organizer.id, startsAt: hoursFromNow(-1) });
    const otherRegistration = await prisma.registration.create({
      data: { eventId: other.id, userId: member.id },
    });
    const agent = await loginAs(organizer);
    const res = await agent
      .put(`/api/events/${event.id}/registrations/${otherRegistration.id}/attendance`)
      .send({ status: "PRESENT" })
      .expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("論理削除済みのイベントは 404", async () => {
    const { organizer, registration, event } = await setup();
    await prisma.event.update({ where: { id: event.id }, data: { deletedAt: new Date() } });
    const agent = await loginAs(organizer);
    const res = await agent
      .put(`/api/events/${event.id}/registrations/${registration.id}/attendance`)
      .send({ status: "PRESENT" })
      .expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("未ログインは 401", async () => {
    const { url } = await setup();
    const res = await request(app).put(url).send({ status: "PRESENT" }).expect(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });
});
