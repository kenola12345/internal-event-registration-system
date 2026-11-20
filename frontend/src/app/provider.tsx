import { QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

import { createQueryClient } from "@/lib/query-client";

/** Wraps the app in global providers. Add new ones (theme, toasts...) here. */
export function AppProvider({ children }: { children: ReactNode }) {
  // useState keeps ONE client for the component's lifetime.
  const [queryClient] = useState(createQueryClient);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
