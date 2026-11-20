import request from "supertest";

import { createApp } from "../src/app.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";

export const app = createApp();

/** Empties every table. Child tables first is unnecessary here because of ON DELETE CASCADE. */
export async function resetDb(): Promise<void> {
  await prisma.user.deleteMany();
}

/** テスト用ユーザーを DB に直接作成する(サインアップ API は提供しないため) */
export async function createUser(email = "alice@example.com", name = "Alice") {
  const passwordHash = await hashPassword("password123");
  return prisma.user.create({ data: { email, name, passwordHash } });
}

/** Cookie を保持する supertest エージェント。ユーザーを作成してログイン済みの状態で返す */
export async function loggedInAgent(email = "alice@example.com") {
  await createUser(email);
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email, password: "password123" }).expect(200);
  return agent;
}
