import type { User as UserRow } from "@prisma/client";
import type { LoginInput, User } from "@template/shared";

import { AppError } from "../errors/AppError.js";
import { DUMMY_HASH, verifyPassword } from "../lib/password.js";
import { prisma } from "../lib/prisma.js";

// Service layer: business rules + database access. No req/res/HTTP in here,
// so the same code can be used from a controller, a script, a job or a test.

/** DB row -> API shape. This is the ONLY place a user leaves the backend, so passwordHash can't leak. */
export function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Same error for "no such email" and "wrong password" so attackers can't discover which emails exist. */
export async function login(input: LoginInput): Promise<User> {
  const row = await prisma.user.findUnique({ where: { email: input.email } });
  const ok = await verifyPassword(input.password, row?.passwordHash ?? DUMMY_HASH);
  if (!row || !ok) throw new AppError("INVALID_CREDENTIALS", "Email or password is incorrect");
  return toUser(row);
}

export async function getUserById(id: string): Promise<User> {
  const row = await prisma.user.findUnique({ where: { id } });
  // The token was valid but the user is gone (deleted): treat as logged out.
  if (!row) throw new AppError("UNAUTHENTICATED", "Please log in");
  return toUser(row);
}
