/** Loading indicator. role="status" lets screen readers announce it. */
export function Spinner() {
  return (
    <div role="status" className="flex justify-center p-8">
      <div className="size-6 animate-spin rounded-full border-2 border-line border-t-brand-600" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
