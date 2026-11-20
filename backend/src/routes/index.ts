import { Router } from "express";

import { authRouter } from "./auth.routes.js";
import { categoriesRouter } from "./categories.routes.js";
import { eventsRouter } from "./events.routes.js";
import { feedbacksRouter } from "./feedbacks.routes.js";
import { healthRouter } from "./health.routes.js";
import { meRouter } from "./me.routes.js";
import { registrationsRouter } from "./registrations.routes.js";
import { tagsRouter } from "./tags.routes.js";
import { waitlistRouter } from "./waitlist.routes.js";

/**
 * Mounted at /api by app.ts. Each feature router declares its own paths.
 * 全ルーターをここで先に登録しておき、並列で実装する各 Phase がこのファイルを編集しないようにする。
 */
export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use(authRouter);
apiRouter.use(eventsRouter);
apiRouter.use(registrationsRouter);
apiRouter.use(waitlistRouter);
apiRouter.use(feedbacksRouter);
apiRouter.use(categoriesRouter);
apiRouter.use(tagsRouter);
apiRouter.use(meRouter);
