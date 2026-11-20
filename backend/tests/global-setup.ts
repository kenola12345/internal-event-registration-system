import { execSync } from "node:child_process";

/** Applies pending migrations to the test database once before the whole run. */
export default function setup(): void {
  execSync("npx --no-install prisma migrate deploy", { stdio: "inherit", env: process.env });
}
