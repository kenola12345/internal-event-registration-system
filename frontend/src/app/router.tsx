import type { RouteObject } from "react-router";

import { RootLayout } from "./root-layout";
import { GuestOnly, RequireAuth } from "./route-guards";
import { LoginPage } from "./routes/login-page";
import { NotFoundPage } from "./routes/not-found-page";
import { SignupPage } from "./routes/signup-page";
import { TodosPage } from "./routes/todos-page";

/** All routes in one place. Add a page: create it in routes/, add one line here. */
export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    children: [
      {
        element: <GuestOnly />,
        children: [
          { path: "/login", element: <LoginPage /> },
          { path: "/signup", element: <SignupPage /> },
        ],
      },
      { element: <RequireAuth />, children: [{ path: "/", element: <TodosPage /> }] },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];
