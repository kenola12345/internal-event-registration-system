import { ErrorMessage } from "@/components/ui/error-message";
import { Spinner } from "@/components/ui/spinner";

import { useTodos } from "../api/todo-queries";
import { TodoItem } from "./todo-item";

/** Handles the three states every data-driven list needs: loading, error, empty (then data). */
export function TodoList() {
  const { data, isPending, error } = useTodos();

  if (isPending) return <Spinner />;
  if (error) return <ErrorMessage message={error.message} />;
  if (data.length === 0)
    return <p className="text-sm text-muted">Nothing to do yet. Add one above.</p>;

  return (
    <ul className="flex flex-col gap-2">
      {data.map((todo) => (
        <TodoItem key={todo.id} todo={todo} />
      ))}
    </ul>
  );
}
