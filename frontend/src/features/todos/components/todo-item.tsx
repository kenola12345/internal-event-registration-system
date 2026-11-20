import type { Todo } from "@template/shared";

import { Button } from "@/components/ui/button";

import { useDeleteTodo, useUpdateTodo } from "../api/todo-queries";

type TodoItemProps = { todo: Todo };

/** One row: checkbox toggles completion, button deletes. */
export function TodoItem({ todo }: TodoItemProps) {
  const update = useUpdateTodo();
  const remove = useDeleteTodo();

  return (
    <li className="flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3">
      <input
        type="checkbox"
        id={`todo-${todo.id}`}
        checked={todo.completed}
        onChange={() => {
          update.mutate({ id: todo.id, completed: !todo.completed });
        }}
        className="size-4"
      />
      <label
        htmlFor={`todo-${todo.id}`}
        className={`flex-1 text-sm ${todo.completed ? "text-muted line-through" : ""}`}
      >
        {todo.title}
      </label>
      <Button
        variant="danger"
        aria-label={`Delete ${todo.title}`}
        onClick={() => {
          remove.mutate(todo.id);
        }}
      >
        Delete
      </Button>
    </li>
  );
}
