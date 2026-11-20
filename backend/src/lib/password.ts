import bcrypt from "bcrypt";

// 12 rounds: slow enough to make brute force expensive, fast enough for a login request.
const SALT_ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * A valid hash of a random string. Login compares against it when the email doesn't exist,
 * so "unknown email" and "wrong password" take the same time (prevents user enumeration by timing).
 */
export const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", SALT_ROUNDS);
