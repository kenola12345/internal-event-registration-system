import { createTodoSchema, todoIdParamSchema, updateTodoSchema } from "@template/shared";
import type { RequestHandler } from "express";

import { getValidated } from "../middleware/validate.js";
import * as todos from "../services/todos.service.js";

// All routes using these handlers are behind requireAuth, so req.user is always set.
function currentUserId(req: Parameters<RequestHandler>[0]): string {
  if (!req.user) throw new Error("requireAuth is missing on this route");
  return req.user.id;
}

export const list: RequestHandler = async (req, res) => {
  res.json({ data: await todos.listTodos(currentUserId(req)) });
};

export const create: RequestHandler = async (req, res) => {
  const input = getValidated(req, "body", createTodoSchema);
  res.status(201).json({ data: await todos.createTodo(currentUserId(req), input) });
};

export const update: RequestHandler = async (req, res) => {
  const { id } = getValidated(req, "params", todoIdParamSchema);
  const input = getValidated(req, "body", updateTodoSchema);
  res.json({ data: await todos.updateTodo(currentUserId(req), id, input) });
};

export const remove: RequestHandler = async (req, res) => {
  const { id } = getValidated(req, "params", todoIdParamSchema);
  await todos.deleteTodo(currentUserId(req), id);
  res.status(204).end();
};
