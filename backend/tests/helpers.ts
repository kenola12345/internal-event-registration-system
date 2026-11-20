import type { Category, Event, User, UserRole } from "@prisma/client";
import request from "supertest";

import { createApp } from "../src/app.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";

export const app = createApp();

/** 全テーブルを空にする。外部キーが RESTRICT なので子テーブルから順に消す */
export async function resetDb(): Promise<void> {
  await prisma.feedback.deleteMany();
  await prisma.waitlistPromotion.deleteMany();
  await prisma.waitlistEntry.deleteMany();
  await prisma.registration.deleteMany();
  await prisma.eventTag.deleteMany();
  await prisma.event.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();
}

/** 現在から n 時間後(負なら過去)の日時。時刻はモックせず、データの日時で過去・未来を表す */
export function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

// bcrypt は遅いので、テスト用パスワードのハッシュは 1 回だけ作って使い回す
let passwordHashCache: Promise<string> | undefined;
const testPasswordHash = () => (passwordHashCache ??= hashPassword("password123"));

/** テスト用ユーザーを DB に直接作成する(サインアップ API は提供しないため)。パスワードは password123 */
export async function createUser(
  options: { email?: string; name?: string; role?: UserRole } = {},
): Promise<User> {
  const email = options.email ?? `user-${crypto.randomUUID()}@example.com`;
  return prisma.user.create({
    data: {
      email,
      name: options.name ?? email.split("@")[0] ?? "user",
      role: options.role ?? "MEMBER",
      passwordHash: await testPasswordHash(),
    },
  });
}

/** テスト用カテゴリを作成する */
export async function createCategory(
  options: { name?: string; isActive?: boolean; sortOrder?: number } = {},
): Promise<Category> {
  return prisma.category.create({
    data: {
      name: options.name ?? `cat-${crypto.randomUUID().slice(0, 8)}`,
      isActive: options.isActive ?? true,
      sortOrder: options.sortOrder ?? 0,
    },
  });
}

type CreateEventOptions = {
  organizerId: string;
  categoryId?: string;
  title?: string;
  capacity?: number;
  /** 既定は 48 時間後に開始、2 時間で終了 */
  startsAt?: Date;
  endsAt?: Date;
  registrationDeadline?: Date | null;
  cancelDeadline?: Date | null;
  deletedAt?: Date | null;
  tags?: string[];
};

/** テスト用イベントを DB に直接作成する(API の検証を通さないので、過去日時のイベントも作れる) */
export async function createEvent(options: CreateEventOptions): Promise<Event> {
  const startsAt = options.startsAt ?? hoursFromNow(48);
  const categoryId = options.categoryId ?? (await createCategory()).id;
  return prisma.event.create({
    data: {
      title: options.title ?? "テストイベント",
      description: "説明",
      startsAt,
      endsAt: options.endsAt ?? new Date(startsAt.getTime() + 2 * 60 * 60 * 1000),
      capacity: options.capacity ?? 10,
      registrationDeadline: options.registrationDeadline ?? null,
      cancelDeadline: options.cancelDeadline ?? null,
      deletedAt: options.deletedAt ?? null,
      categoryId,
      organizerId: options.organizerId,
      tags: {
        create: (options.tags ?? []).map((name) => ({
          tag: { connectOrCreate: { where: { name }, create: { name } } },
        })),
      },
    },
  });
}

/** 指定ユーザーでログイン済みの supertest エージェント(Cookie を保持する) */
export async function loginAs(user: Pick<User, "email">) {
  const agent = request.agent(app);
  await agent
    .post("/api/auth/login")
    .send({ email: user.email, password: "password123" })
    .expect(200);
  return agent;
}

/** ユーザーを作成してログイン済みのエージェントを返す */
export async function loggedInAgent(email = "alice@example.com") {
  return loginAs(await createUser({ email, name: "Alice" }));
}
