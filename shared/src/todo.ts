import { z } from "zod";

// Zod schemas are the single source of truth: the backend validates requests with them,
// the frontend reuses the inferred types (and can validate forms with the same rules).

export const todoIdParamSchema = z.object({ id: z.string().min(1) });

export const createTodoSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(200, "Title must be 200 characters or less"),
});

export const updateTodoSchema = z
  .object({
    title: createTodoSchema.shape.title.optional(),
    completed: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Send at least one field to update");

export type CreateTodoInput = z.infer<typeof createTodoSchema>;
export type UpdateTodoInput = z.infer<typeof updateTodoSchema>;

/** A todo as it travels over the wire (dates are ISO strings in JSON). */
export type Todo = {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
};
