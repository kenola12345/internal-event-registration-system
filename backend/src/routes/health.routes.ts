import { Router } from "express";

import * as health from "../controllers/health.controller.js";

export const healthRouter = Router();

healthRouter.get("/health", health.check);
