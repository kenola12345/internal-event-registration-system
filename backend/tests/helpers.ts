import request from "supertest";

import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

export const app = createApp();

/** Empties every table. Child tables first is unnecessary here because of ON DELETE CASCADE. */
export async function resetDb(): Promise<void> {
  await prisma.user.deleteMany();
}

/** A supertest agent that keeps cookies between calls, already signed up and logged in. */
export async function signedUpAgent(email = "alice@example.com") {
  const agent = request.agent(app);
  await agent
    .post("/api/auth/signup")
    .send({ email, password: "password123", name: "Alice" })
    .expect(201);
  return agent;
}
