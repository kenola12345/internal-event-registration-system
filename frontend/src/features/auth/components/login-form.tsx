import { loginSchema } from "@template/shared";
import { type SubmitEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { FormField } from "@/components/ui/form-field";
import { ApiError } from "@/lib/api-client";

import { useLogin } from "../api/auth-queries";

type FieldErrors = Partial<Record<string, string>>;

/** Login form: validates with the shared Zod schema, then shows server errors (e.g. wrong password). */
export function LoginForm() {
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const login = useLogin();

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = loginSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!parsed.success) {
      setFieldErrors(
        Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])),
      );
      return;
    }
    setFieldErrors({});
    setFormError(null);
    // On success the cache updates and the guest-only route redirects, so nothing else to do.
    login.mutate(parsed.data, {
      onError: (err) => {
        setFormError(err instanceof ApiError ? err.message : "Could not log in");
      },
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
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
        autoComplete="current-password"
        error={fieldErrors.password}
      />
      {formError && <ErrorMessage message={formError} />}
      <Button type="submit" disabled={login.isPending}>
        Log in
      </Button>
    </form>
  );
}
