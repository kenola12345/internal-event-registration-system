import { createTodoSchema } from "@template/shared";
import { type SubmitEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { ApiError } from "@/lib/api-client";

import { useCreateTodo } from "../api/todo-queries";

/** Add-a-todo form. Validates with the SAME Zod schema the backend uses. */
export function TodoForm() {
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = useCreateTodo();

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = createTodoSchema.safeParse({ title });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid title");
      return;
    }
    setError(null);
    create.mutate(parsed.data, {
      onSuccess: () => {
        setTitle("");
      },
      onError: (err) => {
        setError(err instanceof ApiError ? err.message : "Could not add the todo");
      },
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2" noValidate>
      <div className="flex gap-2">
        <label htmlFor="new-todo" className="sr-only">
          New todo
        </label>
        <input
          id="new-todo"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
          }}
          placeholder="What needs doing?"
          aria-invalid={error !== null}
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm"
        />
        <Button type="submit" disabled={create.isPending}>
          Add
        </Button>
      </div>
      {error && <ErrorMessage message={error} />}
    </form>
  );
}
