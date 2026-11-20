import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";

import { env } from "./config/env.js";
import { apiNotFound, errorHandler } from "./middleware/errorHandler.js";
import { apiRouter } from "./routes/index.js";

/**
 * Builds the Express app WITHOUT listening, so tests can call it directly (supertest).
 * Starting the server is server.ts's job.
 */
export function createApp(): Express {
  const app = express();

  app.use(helmet());
  // credentials: true lets the browser send the auth cookie; origin must be explicit (not "*").
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));

  app.use("/api", apiRouter);
  app.use("/api", apiNotFound);

  app.use(errorHandler);
  return app;
}
