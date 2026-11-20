import { Navigate, Outlet, useLocation } from "react-router";

import { Spinner } from "@/components/ui/spinner";
import { useMe } from "@/features/auth/api/auth-queries";

/** Wrap pages that need a login. Guests are sent to /login. */
export function RequireAuth() {
  const { user, isLoading } = useMe();
  const location = useLocation();
  if (isLoading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Wrap login/signup. Already-logged-in users are sent to the home page. */
export function GuestOnly() {
  const { user, isLoading } = useMe();
  if (isLoading) return <Spinner />;
  if (user) return <Navigate to="/" replace />;
  return <Outlet />;
}
