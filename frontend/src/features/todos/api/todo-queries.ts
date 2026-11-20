import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateTodoInput, UpdateTodoInput } from "@template/shared";

import { createTodo, deleteTodo, fetchTodos, updateTodo } from "./todos.api";

/**
 * Query key factory, colocated with the queries that use it (TkDodo: "Effective React Query Keys").
 * Keys go from generic to specific, so you can invalidate any level of the cache.
 */
export const todoKeys = {
  all: ["todos"] as const,
  lists: () => [...todoKeys.all, "list"] as const,
};

/** Key + fetcher bundled together, reusable by useQuery, prefetching and route loaders. */
export const todosQueryOptions = () =>
  queryOptions({ queryKey: todoKeys.lists(), queryFn: fetchTodos });

export const useTodos = () => useQuery(todosQueryOptions());

// Mutations invalidate the lists so the UI refetches the truth from the server.
function useInvalidateTodos() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: todoKeys.all });
}

export function useCreateTodo() {
  const invalidate = useInvalidateTodos();
  return useMutation({
    mutationFn: (input: CreateTodoInput) => createTodo(input),
    onSuccess: invalidate,
  });
}

export function useUpdateTodo() {
  const invalidate = useInvalidateTodos();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateTodoInput & { id: string }) => updateTodo(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteTodo() {
  const invalidate = useInvalidateTodos();
  return useMutation({ mutationFn: (id: string) => deleteTodo(id), onSuccess: invalidate });
}
