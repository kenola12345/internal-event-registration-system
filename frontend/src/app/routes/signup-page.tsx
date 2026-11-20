import { Link } from "react-router";

import { SignupForm } from "@/features/auth/components/signup-form";

export function SignupPage() {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Create an account</h2>
      <SignupForm />
      <p className="text-sm text-muted">
        Already registered?{" "}
        <Link to="/login" className="text-brand-600 underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
