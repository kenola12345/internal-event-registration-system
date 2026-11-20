import { signupSchema } from "@template/shared";
import { type SubmitEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { FormField } from "@/components/ui/form-field";
import { ApiError } from "@/lib/api-client";

import { useSignup } from "../api/auth-queries";

type FieldErrors = Partial<Record<string, string>>;

/** Signup form. Server-side field errors (details) are mapped back onto the matching inputs. */
export function SignupForm() {
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const signup = useSignup();

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = signupSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!parsed.success) {
      setFieldErrors(
        Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])),
      );
      return;
    }
    setFieldErrors({});
    setFormError(null);
    signup.mutate(parsed.data, {
      onError: (err) => {
        if (err instanceof ApiError && err.details) {
          setFieldErrors(Object.fromEntries(err.details.map((d) => [d.field, d.message])));
        } else {
          setFormError(err instanceof ApiError ? err.message : "Could not sign up");
        }
      },
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <FormField id="name" name="name" label="Name" autoComplete="name" error={fieldErrors.name} />
      <FormField
        id="email"
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        error={fieldErrors.email}
      />
      <FormField
        id="password"
        name="password"
        type="password"
        label="Password"
        autoComplete="new-password"
        error={fieldErrors.password}
      />
      {formError && <ErrorMessage message={formError} />}
      <Button type="submit" disabled={signup.isPending}>
        Create account
      </Button>
    </form>
  );
}
