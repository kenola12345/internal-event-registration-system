type ErrorMessageProps = { message: string };

/** Inline error. role="alert" makes screen readers announce it immediately. */
export function ErrorMessage({ message }: ErrorMessageProps) {
  return (
    <p role="alert" className="text-sm text-danger">
      {message}
    </p>
  );
}
