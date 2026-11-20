import type { AttendanceStatus } from "@prisma/client";

import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";

// 開発用のサンプルデータ(マニフェスト 9.5)。何度実行しても同じ状態になる(既存データを消してから作る)。
// 日時は実行時刻からの相対値で作り、いつ起動しても「これから」「締切済み」「開催済み」のイベントが揃うようにする。
// パスワードは全員 password123(開発専用)。

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const now = Date.now();
/** 現在から ms 後の日時(負なら過去) */
const at = (ms: number) => new Date(now + ms);

/** 既存データを削除する。外部キーが RESTRICT なので子テーブルから順に消す */
async function clearAll(): Promise<void> {
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

/** ユーザー 6 名(admin 1 名 + member 5 名) */
async function seedUsers() {
  const passwordHash = await hashPassword("password123");
  const create = (email: string, name: string, role: "MEMBER" | "ADMIN" = "MEMBER") =>
    prisma.user.create({ data: { email, name, role, passwordHash } });
  return {
    admin: await create("admin@example.com", "Admin", "ADMIN"),
    alice: await create("alice@example.com", "Alice"),
    bob: await create("bob@example.com", "Bob"),
    carol: await create("carol@example.com", "Carol"),
    dave: await create("dave@example.com", "Dave"),
    erin: await create("erin@example.com", "Erin"),
  };
}

/** 初期カテゴリ 5 件(マニフェスト 3-4)と、⑧で使う無効化カテゴリ 1 件 */
async function seedCategories() {
  const create = (name: string, sortOrder: number, isActive = true) =>
    prisma.category.create({ data: { name, sortOrder, isActive } });
  return {
    study: await create("勉強会", 10),
    social: await create("懇親会", 20),
    lecture: await create("講演会", 30),
    training: await create("研修", 40),
    other: await create("その他", 50),
    // 使用中のため削除できず、無効化されたカテゴリの例
    legacy: await create("LT大会(終了)", 90, false),
  };
}

type EventSeed = {
  title: string;
  description: string;
  location?: string;
  startsAt: Date;
  hours?: number;
  capacity: number;
  registrationDeadline?: Date;
  cancelDeadline?: Date;
  deletedAt?: Date;
  categoryId: string;
  organizerId: string;
  tags?: string[];
  /** 参加確定者と出席状態(未指定は UNMARKED) */
  registrations?: { userId: string; attendance?: AttendanceStatus }[];
  /** キャンセル待ち(配列の順が待機順) */
  waitlist?: string[];
};

/** イベントと参加登録・待機を作る */
async function createEvent(seed: EventSeed) {
  const event = await prisma.event.create({
    data: {
      title: seed.title,
      description: seed.description,
      location: seed.location ?? null,
      startsAt: seed.startsAt,
      endsAt: new Date(seed.startsAt.getTime() + (seed.hours ?? 2) * HOUR),
      capacity: seed.capacity,
      registrationDeadline: seed.registrationDeadline ?? null,
      cancelDeadline: seed.cancelDeadline ?? null,
      deletedAt: seed.deletedAt ?? null,
      categoryId: seed.categoryId,
      organizerId: seed.organizerId,
      tags: {
        create: (seed.tags ?? []).map((name) => ({
          tag: { connectOrCreate: { where: { name }, create: { name } } },
        })),
      },
    },
  });
  for (const [index, registration] of (seed.registrations ?? []).entries()) {
    const attendance = registration.attendance ?? "UNMARKED";
    await prisma.registration.create({
      data: {
        eventId: event.id,
        userId: registration.userId,
        attendance,
        attendanceMarkedAt: attendance === "UNMARKED" ? null : seed.startsAt,
        attendanceMarkedById: attendance === "UNMARKED" ? null : seed.organizerId,
        // 登録順を固定するため 1 分ずつずらす
        createdAt: at(-30 * DAY + index * 60 * 1000),
      },
    });
  }
  for (const [index, userId] of (seed.waitlist ?? []).entries()) {
    await prisma.waitlistEntry.create({ data: { eventId: event.id, userId, position: index + 1 } });
  }
  return event;
}

async function main(): Promise<void> {
  await clearAll();
  const u = await seedUsers();
  const c = await seedCategories();

  // ① 空きあり(alice 主催・これから)
  await createEvent({
    title: "React 入門ハンズオン",
    description:
      "React の基本(コンポーネント・state・props)を手を動かして学びます。\nノート PC を持参してください。",
    location: "本社 5F 会議室A",
    startsAt: at(7 * DAY),
    capacity: 30,
    categoryId: c.study.id,
    organizerId: u.alice.id,
    tags: ["react", "typescript", "新人向け"],
    registrations: [{ userId: u.bob.id }, { userId: u.carol.id }],
  });

  // ② 満席 + キャンセル待ち 2 名(bob 主催・定員 2)
  await createEvent({
    title: "冬の懇親会",
    description: "部署を越えて交流しましょう。軽食あり。",
    location: "本社 1F カフェスペース",
    startsAt: at(5 * DAY),
    capacity: 2,
    categoryId: c.social.id,
    organizerId: u.bob.id,
    tags: ["交流"],
    registrations: [{ userId: u.alice.id }, { userId: u.carol.id }],
    waitlist: [u.dave.id, u.erin.id],
  });

  // ③ 登録締切済み・開催前(carol 主催)
  await createEvent({
    title: "クラウド設計の講演会",
    description: "外部講師を招いて AWS の設計パターンを紹介します。",
    location: "オンライン",
    startsAt: at(3 * DAY),
    capacity: 100,
    registrationDeadline: at(-1 * HOUR),
    categoryId: c.lecture.id,
    organizerId: u.carol.id,
    tags: ["aws", "オンライン"],
    registrations: [{ userId: u.dave.id }],
  });

  // ④ キャンセル期限済み・開催前(dave 主催)
  await createEvent({
    title: "セキュリティ研修",
    description: "全社員向けの情報セキュリティ研修です。",
    location: "本社 3F 研修室",
    startsAt: at(2 * DAY),
    capacity: 20,
    cancelDeadline: at(-1 * HOUR),
    categoryId: c.training.id,
    organizerId: u.dave.id,
    tags: ["セキュリティ", "新人向け"],
    registrations: [{ userId: u.alice.id }, { userId: u.erin.id }],
  });

  // ⑤ 開催済み・出席状態混在・レビュー 3 件(うち匿名 1・非公開 1)(alice 主催)
  const pastEvent = await createEvent({
    title: "TypeScript 型パズル勉強会",
    description: "型レベルプログラミングの基礎を学びました。",
    location: "本社 5F 会議室B",
    startsAt: at(-7 * DAY),
    capacity: 10,
    categoryId: c.study.id,
    organizerId: u.alice.id,
    tags: ["typescript"],
    registrations: [
      { userId: u.bob.id, attendance: "PRESENT" },
      { userId: u.carol.id, attendance: "ABSENT" },
      { userId: u.dave.id },
      { userId: u.erin.id, attendance: "PRESENT" },
      { userId: u.admin.id, attendance: "PRESENT" },
    ],
  });
  await prisma.feedback.createMany({
    data: [
      { eventId: pastEvent.id, userId: u.bob.id, rating: 5, comment: "とても分かりやすかったです" },
      {
        eventId: pastEvent.id,
        userId: u.erin.id,
        rating: 4,
        comment: "もう少し演習の時間が欲しかった",
        isAnonymous: true,
      },
      {
        eventId: pastEvent.id,
        userId: u.admin.id,
        rating: 1,
        comment: "(不適切な内容の例として非公開化したレビュー)",
        isHidden: true,
        hiddenAt: at(-6 * DAY),
        hiddenById: u.admin.id,
      },
    ],
  });

  // ⑥ 開催済み・フィードバック未投稿の出席者あり(bob 主催。alice が出席済みで未投稿)
  await createEvent({
    title: "新人歓迎会",
    description: "新しく入社した方を歓迎します。",
    startsAt: at(-3 * DAY),
    capacity: 40,
    categoryId: c.social.id,
    organizerId: u.bob.id,
    registrations: [
      { userId: u.alice.id, attendance: "PRESENT" },
      { userId: u.carol.id, attendance: "PRESENT" },
    ],
  });

  // ⑦ 論理削除済み(erin 主催。どの API からも見えない)
  await createEvent({
    title: "(削除済み)ボードゲーム会",
    description: "削除されたイベントの例です。",
    startsAt: at(10 * DAY),
    capacity: 8,
    deletedAt: at(-1 * DAY),
    categoryId: c.other.id,
    organizerId: u.erin.id,
    registrations: [{ userId: u.bob.id }],
  });

  // ⑧ 無効化カテゴリを使う過去イベント(carol 主催)
  await createEvent({
    title: "社内 LT 大会 2026 春",
    description: "無効化されたカテゴリのイベントの例です。",
    startsAt: at(-30 * DAY),
    capacity: 50,
    categoryId: c.legacy.id,
    organizerId: u.carol.id,
    tags: ["lt"],
    registrations: [{ userId: u.alice.id, attendance: "PRESENT" }],
  });

  console.warn(
    "Seeded: admin@example.com / alice, bob, carol, dave, erin @example.com (password: password123)",
  );
}

await main();
await prisma.$disconnect();
