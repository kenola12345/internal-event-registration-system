import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderApp } from "@/testing/render-app";

const user = {
  id: "u1",
  email: "a@example.com",
  name: "Alice",
  role: "USER",
  createdAt: "2026-01-01T00:00:00.000Z",
};
const todo = {
  id: "1",
  title: "Write tests",
  completed: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const loggedIn = { "GET /api/auth/me": { status: 200, body: { data: user } } };

describe("TodosPage", () => {
  it("shows todos from the API", async () => {
    renderApp("/", { ...loggedIn, "GET /api/todos": { status: 200, body: { data: [todo] } } });
    expect(await screen.findByText("Write tests")).toBeInTheDocument();
  });

  it("shows an empty state", async () => {
    renderApp("/", { ...loggedIn, "GET /api/todos": { status: 200, body: { data: [] } } });
    expect(await screen.findByText(/nothing to do yet/i)).toBeInTheDocument();
  });

  it("shows the API error message", async () => {
    renderApp("/", {
      ...loggedIn,
      "GET /api/todos": {
        status: 500,
        body: { error: { code: "INTERNAL_ERROR", message: "Boom" } },
      },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Boom");
  });
});
