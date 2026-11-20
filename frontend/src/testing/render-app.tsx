import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { vi } from "vitest";

import { routes } from "@/app/router";
import { createQueryClient } from "@/lib/query-client";

type Reply = { status: number; body?: unknown };
/** "METHOD /api/path" -> response. Any request not listed fails the test loudly. */
export type ApiMock = Record<string, Reply>;

/** Replaces fetch with the mock, then renders the whole app (router included) at `path`. */
export function renderApp(path: string, api: ApiMock) {
  const fetchMock = vi.fn((input: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${new URL(input, "http://localhost").pathname}`;
    const reply = api[key];
    if (!reply) throw new Error(`Unmocked request: ${key}`);
    return Promise.resolve(
      reply.status === 204
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify(reply.body), { status: reply.status }),
    );
  });
  vi.stubGlobal("fetch", fetchMock);

  // Never retry in tests: a failing request should surface immediately, not after a backoff delay.
  const queryClient = createQueryClient();
  const defaults = queryClient.getDefaultOptions();
  queryClient.setDefaultOptions({ ...defaults, queries: { ...defaults.queries, retry: false } });

  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { fetchMock };
}
