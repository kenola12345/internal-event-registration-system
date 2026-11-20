import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { schedulePurgeCompletedTodos } from "./jobs/purgeCompletedTodos.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info("server started", { url: `http://localhost:${String(env.PORT)}` });
});

schedulePurgeCompletedTodos();

// Close the HTTP server and DB pool cleanly on Ctrl+C / container stop.
function shutdown(): void {
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
