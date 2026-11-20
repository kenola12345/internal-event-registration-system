import { Router } from "express";

import { authRouter } from "./auth.routes.js";
import { healthRouter } from "./health.routes.js";
import { todosRouter } from "./todos.routes.js";

/** Mounted at /api by app.ts. Each feature router declares its own paths; register new ones here. */
export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use(authRouter);
apiRouter.use(todosRouter);
