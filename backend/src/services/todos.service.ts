import { Prisma, type Todo as TodoRow } from "@prisma/client";
import type { CreateTodoInput, Todo, UpdateTodoInput } from "@template/shared";

import { AppError } from "../errors/AppError.js";
import { prisma } from "../lib/prisma.js";

/** DB row -> API shape (Dates become ISO strings). */
function toTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    title: row.title,
    completed: row.completed,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// Every query is scoped by userId. Another user's todo behaves exactly like a missing one (404),
// which prevents IDOR (guessing ids to read/edit other people's data) and doesn't reveal it exists.

export async function listTodos(userId: string): Promise<Todo[]> {
  const rows = await prisma.todo.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  return rows.map(toTodo);
}

export async function createTodo(userId: string, input: CreateTodoInput): Promise<Todo> {
  return toTodo(await prisma.todo.create({ data: { title: input.title, userId } }));
}

export async function updateTodo(
  userId: string,
  id: string,
  input: UpdateTodoInput,
): Promise<Todo> {
  try {
    return toTodo(await prisma.todo.update({ where: { id, userId }, data: input }));
  } catch (err) {
    throw mapNotFound(err);
  }
}

export async function deleteTodo(userId: string, id: string): Promise<void> {
  try {
    await prisma.todo.delete({ where: { id, userId } });
  } catch (err) {
    throw mapNotFound(err);
  }
}

/** Prisma's "record not found" (P2025) becomes our 404; anything else is re-thrown untouched. */
function mapNotFound(err: unknown): unknown {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
    return new AppError("NOT_FOUND", "Todo not found");
  }
  return err;
}
