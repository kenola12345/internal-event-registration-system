import type { FieldError } from "@template/shared";
import type { Request, RequestHandler } from "express";
import type { z, ZodType } from "zod";

import { AppError } from "../errors/AppError.js";

type Schemas = { params?: ZodType; query?: ZodType; body?: ZodType };
type Part = keyof Schemas;

/** Validates params / query / body with Zod and responds 400 VALIDATION_ERROR listing every bad field. */
export function validate(schemas: Schemas): RequestHandler {
  return (req, _res, next) => {
    const details: FieldError[] = [];
    const validated: Partial<Record<Part, unknown>> = {};
    for (const part of ["params", "query", "body"] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(part === "body" ? (req.body ?? {}) : req[part]);
      if (result.success) {
        validated[part] = result.data;
      } else {
        for (const issue of result.error.issues) {
          details.push({ field: issue.path.join(".") || part, message: issue.message });
        }
      }
    }
    if (details.length > 0) {
      throw new AppError("VALIDATION_ERROR", "Some fields are invalid", details);
    }
    // Express 5 makes req.query read-only, so validated values live on their own property.
    req.validated = { ...req.validated, ...validated };
    next();
  };
}

/** Reads input already validated by validate(). Throws if the route forgot to call validate(). */
export function getValidated<S extends ZodType>(req: Request, part: Part, _schema: S): z.infer<S> {
  const value = req.validated?.[part];
  if (value === undefined) throw new Error(`validate() is missing for req.${part}`);
  return value as z.infer<S>;
}
