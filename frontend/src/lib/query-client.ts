import { QueryClient } from "@tanstack/react-query";

import { ApiError } from "./api-client";

/** One QueryClient for the app. 4xx errors won't change on retry, so don't retry them. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (error instanceof ApiError && error.status < 500) return false;
          return failureCount < 1;
        },
      },
      mutations: { retry: false },
    },
  });
}
