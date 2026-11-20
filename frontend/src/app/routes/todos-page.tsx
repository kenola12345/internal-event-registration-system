import { TodoForm } from "@/features/todos/components/todo-form";
import { TodoList } from "@/features/todos/components/todo-list";

/** The app layer composes features into pages. Pages contain layout, not logic. */
export function TodosPage() {
  return (
    <div className="flex flex-col gap-6">
      <TodoForm />
      <TodoList />
    </div>
  );
}
