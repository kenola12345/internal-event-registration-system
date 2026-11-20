import type { Event, User } from "@prisma/client";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../src/lib/prisma.js";
import { getEventDetail } from "../src/services/event-view.service.js";
import { app, createEvent, createUser, hoursFromNow, loginAs, resetDb } from "./helpers.js";

beforeEach(resetDb);

/** 定員 capacity のイベントを作り、参加確定者で満席にする */
async function fullEvent(
  organizer: User,
  options: { capacity?: number; startsAt?: Date; registrationDeadline?: Date | null } = {},
): Promise<Event> {
  const capacity = options.capacity ?? 1;
  const event = await createEvent({ organizerId: organizer.id, ...options, capacity });
  for (let i = 0; i < capacity; i++) {
    const user = await createUser();
    await prisma.registration.create({ data: { eventId: event.id, userId: user.id } });
  }
  return event;
}

/** ユーザーとしてキャンセル待ち登録し、レスポンスを返す */
async function join(user: User, eventId: string, status = 201) {
  const agent = await loginAs(user);
  return agent.post(`/api/events/${eventId}/waitlist`).expect(status);
}

/**
 * ユーザーから見た待機順位(myStatus.rank)。E2 は別 Phase で並行実装中のため、
 * W1 のレスポンスと同じ共通サービス getEventDetail で確認する。
 */
async function rankOf(user: User, eventId: string): Promise<number | undefined> {
  const detail = await getEventDetail({ id: user.id, role: user.role }, eventId);
  return detail.myStatus.kind === "WAITLISTED" ? detail.myStatus.rank : undefined;
}

describe("POST /api/events/:eventId/waitlist", () => {
  it("未ログインは 401", async () => {
    const organizer = await createUser();
    const event = await fullEvent(organizer);
    const res = await request(app).post(`/api/events/${event.id}/waitlist`).expect(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("eventId が cuid でなければ 400", async () => {
    const res = await join(await createUser(), "not-a-cuid", 400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("存在しない・削除済みのイベントは 404", async () => {
    const organizer = await createUser();
    const deleted = await createEvent({ organizerId: organizer.id, deletedAt: new Date() });
    const user = await createUser();
    expect((await join(user, deleted.id, 404)).body.error.code).toBe("NOT_FOUND");
    expect((await join(user, "cmissingevent000000000000", 404)).body.error.code).toBe("NOT_FOUND");
  });

  it("満席なら登録でき、myStatus は WAITLISTED rank 1", async () => {
    const organizer = await createUser();
    const event = await fullEvent(organizer);
    const user = await createUser();
    const res = await join(user, event.id);
    expect(res.body.data.waitlistEntryId).toEqual(expect.any(String));
    expect(res.body.data.event.id).toBe(event.id);
    expect(res.body.data.event.myStatus).toEqual({ kind: "WAITLISTED", rank: 1 });
    expect(res.body.data.event.waitlistCount).toBe(1);
    const entry = await prisma.waitlistEntry.findUniqueOrThrow({
      where: { id: res.body.data.waitlistEntryId },
    });
    expect(entry.position).toBe(1);
  });

  it("空きがあれば 409 SEATS_AVAILABLE", async () => {
    const organizer = await createUser();
    const event = await createEvent({ organizerId: organizer.id, capacity: 2 });
    const res = await join(await createUser(), event.id, 409);
    expect(res.body.error.code).toBe("SEATS_AVAILABLE");
    expect(await prisma.waitlistEntry.count()).toBe(0);
  });

  it("主催者は 403 ORGANIZER_CANNOT_REGISTER", async () => {
    const organizer = await createUser();
    const event = await fullEvent(organizer);
    const res = await join(organizer, event.id, 403);
    expect(res.body.error.code).toBe("ORGANIZER_CANNOT_REGISTER");
  });

  it("主催者の判定は締切より先(締切後でも 403)", async () => {
    const organizer = await createUser();
    const event = await fullEvent(organizer, { registrationDeadline: hoursFromNow(-1) });
    const res = await join(organizer, event.id, 403);
    expect(res.body.error.code).toBe("ORGANIZER_CANNOT_REGISTER");
  });

  it("登録締切後は 409 REGISTRATION_CLOSED", async () => {
    const organizer = await createUser();
    const event = await fullEvent(organizer, { registrationDeadline: hoursFromNow(-1) });
    const res = await join(await createUser(), event.id, 409);
    expect(res.body.error.code).toBe("REGISTRATION_CLOSED");
  });

  it("開催開始後は 409 REGISTRATION_CLOSED", async () => {
    const organizer = await createUser();
    const event = await fullEvent(organizer, { startsAt: hoursFromNow(-1) });
    const res = await join(await createUser(), event.id, 409);
    expect(res.body.error.code).toBe("REGISTRATION_CLOSED");
  });

  it("二重登録は 409 ALREADY_REGISTERED", async () => {
    const organizer = await createUser();
    const event = await fullEvent(organizer);
    const user = await createUser();
    await join(user, event.id);
    const res = await join(user, event.id, 409);
    expect(res.body.error.code).toBe("ALREADY_REGISTERED");
    expect(await prisma.waitlistEntry.count()).toBe(1);
  });

  it("参加確定済みの人は 409 ALREADY_REGISTERED", async () => {
    const organizer = await createUser();
    const event = await fullEvent(organizer);
    const registered = await prisma.registration.findFirstOrThrow({ where: { eventId: event.id } });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: registered.userId } });
    const res = await join(user, event.id, 409);
    expect(res.body.error.code).toBe("ALREADY_REGISTERED");
  });

  it("順位が 1, 2, 3 と付く", async () => {
    const organizer = await createUser();
    const event = await fullEvent(organizer);
    const ranks: number[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await join(await createUser(), event.id);
      ranks.push(res.body.data.event.myStatus.rank as number);
    }
    expect(ranks).toEqual([1, 2, 3]);
  });
});

describe("DELETE /api/events/:eventId/waitlist", () => {
  it("未ログインは 401", async () => {
    const organizer = await createUser();
    const event = await fullEvent(organizer);
    await request(app).delete(`/api/events/${event.id}/waitlist`).expect(401);
  });

  it("自分の待機を解除すると 204、待機していなければ 404", async () => {
    const organizer = await createUser();
    const event = await fullEvent(organizer);
    const user = await createUser();
    await join(user, event.id);
    const agent = await loginAs(user);
    await agent.delete(`/api/events/${event.id}/waitlist`).expect(204);
    expect(await prisma.waitlistEntry.count()).toBe(0);
    const res = await agent.delete(`/api/events/${event.id}/waitlist`).expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("中間の人が抜けると後ろの人の順位が 1 つ上がり、他の行の position は変わらない", async () => {
    const organizer = await createUser();
    const event = await fullEvent(organizer);
    const [first, middle, last] = [await createUser(), await createUser(), await createUser()];
    for (const user of [first, middle, last]) await join(user, event.id);
    expect(await rankOf(last, event.id)).toBe(3);

    await (await loginAs(middle)).delete(`/api/events/${event.id}/waitlist`).expect(204);

    expect(await rankOf(first, event.id)).toBe(1);
    expect(await rankOf(last, event.id)).toBe(2);
    const positions = await prisma.waitlistEntry.findMany({
      where: { eventId: event.id },
      orderBy: { position: "asc" },
      select: { userId: true, position: true },
    });
    expect(positions).toEqual([
      { userId: first.id, position: 1 },
      { userId: last.id, position: 3 },
    ]);
  });

  it("解除して再登録すると最後尾になる", async () => {
    const organizer = await createUser();
    const event = await fullEvent(organizer);
    const [a, b, c] = [await createUser(), await createUser(), await createUser()];
    for (const user of [a, b, c]) await join(user, event.id);

    await (await loginAs(a)).delete(`/api/events/${event.id}/waitlist`).expect(204);
    const res = await join(a, event.id);
    expect(res.body.data.event.myStatus).toEqual({ kind: "WAITLISTED", rank: 3 });
    expect(await rankOf(b, event.id)).toBe(1);
    expect(await rankOf(c, event.id)).toBe(2);
  });

  it("既に繰り上げ済み(参加確定)の人の解除は 404", async () => {
    const organizer = await createUser();
    const event = await fullEvent(organizer);
    const user = await createUser();
    await join(user, event.id);
    // 繰り上げを DB 上で再現する: 待機行を削除して参加確定行を作る
    await prisma.$transaction([
      prisma.waitlistEntry.deleteMany({ where: { eventId: event.id, userId: user.id } }),
      prisma.registration.create({ data: { eventId: event.id, userId: user.id } }),
    ]);
    const res = await (await loginAs(user)).delete(`/api/events/${event.id}/waitlist`).expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(await prisma.registration.count({ where: { eventId: event.id, userId: user.id } })).toBe(
      1,
    );
  });

  it("削除済みイベントは 404", async () => {
    const organizer = await createUser();
    const event = await createEvent({ organizerId: organizer.id, deletedAt: new Date() });
    const res = await (
      await loginAs(await createUser())
    )
      .delete(`/api/events/${event.id}/waitlist`)
      .expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
