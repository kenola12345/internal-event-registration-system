import type { RequestHandler } from "express";

/** Liveness check for the frontend, uptime monitors and container healthchecks. */
export const check: RequestHandler = (_req, res) => {
  res.json({ data: { ok: true } });
};
