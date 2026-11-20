import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-start gap-2">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <Link to="/" className="text-brand-600 underline">
        Back to home
      </Link>
    </div>
  );
}
