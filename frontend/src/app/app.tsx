import { useState } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";

import { AppProvider } from "./provider";
import { routes } from "./router";

/** Application root: providers + router. */
export function App() {
  const [router] = useState(() => createBrowserRouter(routes));
  return (
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>
  );
}
