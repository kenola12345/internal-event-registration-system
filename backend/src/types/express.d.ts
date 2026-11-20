import type { UserRole } from "@template/shared";

// Extends Express's Request with the fields our middleware add.
declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth. Present on every authenticated route. */
      user?: { id: string; role: UserRole };
      /** Set by validate(). Read through getValidated() to get proper types. */
      validated?: Partial<Record<"params" | "query" | "body", unknown>>;
    }
  }
}

export {};
