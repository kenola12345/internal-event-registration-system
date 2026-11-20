import { Link } from "react-router";

import { LoginForm } from "@/features/auth/components/login-form";

export function LoginPage() {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Log in</h2>
      <LoginForm />
      <p className="text-sm text-muted">
        No account?{" "}
        <Link to="/signup" className="text-brand-600 underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
