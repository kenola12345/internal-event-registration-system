import type { CreateTodoInput, Todo, UpdateTodoInput } from "@template/shared";

import { apiFetch, jsonBody } from "@/lib/api-client";

// Plain request functions: no React here, so they are trivial to test and reuse.

export const fetchTodos = (): Promise<Todo[]> => apiFetch<Todo[]>("/todos");

export const createTodo = (input: CreateTodoInput): Promise<Todo> =>
  apiFetch<Todo>("/todos", { method: "POST", ...jsonBody(input) });

export const updateTodo = (id: string, input: UpdateTodoInput): Promise<Todo> =>
  apiFetch<Todo>(`/todos/${id}`, { method: "PATCH", ...jsonBody(input) });

export async function deleteTodo(id: string): Promise<void> {
  await apiFetch<undefined>(`/todos/${id}`, { method: "DELETE" });
}
