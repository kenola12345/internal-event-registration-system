import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const KEEP_DAYS = 30;

/** Deletes todos completed more than KEEP_DAYS ago. Sample of a recurring background job. */
export async function purgeCompletedTodos(): Promise<number> {
  const cutoff = new Date(Date.now() - KEEP_DAYS * ONE_DAY_MS);
  const { count } = await prisma.todo.deleteMany({
    where: { completed: true, updatedAt: { lt: cutoff } },
  });
  return count;
}

/** Runs the job once a day. unref() so the timer never keeps the process alive on shutdown. */
export function schedulePurgeCompletedTodos(): void {
  setInterval(() => {
    purgeCompletedTodos()
      .then((count) => {
        logger.info("purged completed todos", { count });
      })
      .catch((err: unknown) => {
        logger.error("purgeCompletedTodos failed", { err });
      });
  }, ONE_DAY_MS).unref();
}
