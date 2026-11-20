import { createTodoSchema, todoIdParamSchema, updateTodoSchema } from "@template/shared";
import { Router } from "express";

import * as todos from "../controllers/todos.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

export const todosRouter = Router();

// Everything under /todos needs a logged-in user.
todosRouter.use("/todos", requireAuth);

todosRouter.get("/todos", todos.list);
todosRouter.post("/todos", validate({ body: createTodoSchema }), todos.create);
todosRouter.patch(
  "/todos/:id",
  validate({ params: todoIdParamSchema, body: updateTodoSchema }),
  todos.update,
);
todosRouter.delete("/todos/:id", validate({ params: todoIdParamSchema }), todos.remove);
