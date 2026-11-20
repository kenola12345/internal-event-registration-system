import { Outlet } from "react-router";

import { Button } from "@/components/ui/button";
import { useLogout, useMe } from "@/features/auth/api/auth-queries";

/** Shared page frame (header + centered content). Every route renders inside <Outlet />. */
export function RootLayout() {
  const { user } = useMe();
  const logout = useLogout();

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 px-4 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Fullstack Template</h1>
          <p className="text-sm text-muted">React + Express + Prisma + PostgreSQL</p>
        </div>
        {user && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">{user.name}</span>
            <Button
              variant="secondary"
              onClick={() => {
                logout.mutate();
              }}
            >
              Log out
            </Button>
          </div>
        )}
      </header>
      <main className="flex flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  );
}
