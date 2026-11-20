import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { renderApp } from "@/testing/render-app";

const unauthenticated = {
  status: 401,
  body: { error: { code: "UNAUTHENTICATED", message: "Please log in" } },
};

describe("auth routing", () => {
  it("redirects guests from / to the login page", async () => {
    renderApp("/", { "GET /api/auth/me": unauthenticated });
    expect(await screen.findByRole("heading", { name: "Log in" })).toBeInTheDocument();
  });

  it("shows client-side validation errors without calling the API", async () => {
    const { fetchMock } = renderApp("/login", { "GET /api/auth/me": unauthenticated });
    await userEvent.click(await screen.findByRole("button", { name: "Log in" }));
    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the initial /auth/me
  });

  it("shows the server error for wrong credentials", async () => {
    renderApp("/login", {
      "GET /api/auth/me": unauthenticated,
      "POST /api/auth/login": {
        status: 401,
        body: { error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect" } },
      },
    });
    await userEvent.type(await screen.findByLabelText("Email"), "a@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Email or password is incorrect");
  });
});
