import type { InputHTMLAttributes } from "react";

import { ErrorMessage } from "./error-message";

type FormFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  /** Validation message shown under the input. */
  error?: string | undefined;
};

/** Label + input + error, wired together for accessibility (htmlFor, aria-invalid, aria-describedby). */
export function FormField({ id, label, error, ...inputProps }: FormFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error !== undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
        {...inputProps}
      />
      {error && (
        <div id={`${id}-error`}>
          <ErrorMessage message={error} />
        </div>
      )}
    </div>
  );
}
