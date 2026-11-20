import { defineConfig } from "vitest/config";

// Tests run against a dedicated database (.env.test), never the development one.
process.loadEnvFile(".env.test");

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    // API tests share one database, so run files one after another.
    fileParallelism: false,
  },
});
