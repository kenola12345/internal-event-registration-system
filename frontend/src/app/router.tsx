import type { RouteObject } from "react-router";

import { RootLayout } from "./root-layout";
import { GuestOnly, RequireAuth } from "./route-guards";
import { HomePage } from "./routes/home-page";
import { LoginPage } from "./routes/login-page";
import { NotFoundPage } from "./routes/not-found-page";

/** All routes in one place. Add a page: create it in routes/, add one line here. */
export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    children: [
      {
        element: <GuestOnly />,
        children: [{ path: "/login", element: <LoginPage /> }],
      },
      { element: <RequireAuth />, children: [{ path: "/", element: <HomePage /> }] },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];
