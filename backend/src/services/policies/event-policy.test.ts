import { describe, expect, it } from "vitest";

import { AppError } from "../../errors/AppError.js";
import { assertCanManageEvent, canManageEvent } from "./event-policy.js";

const event = { organizerId: "organizer" };

describe("canManageEvent", () => {
  it("主催者本人は管理できる", () => {
    expect(canManageEvent({ id: "organizer", role: "MEMBER" }, event)).toBe(true);
  });

  it("admin は主催者でなくても管理できる", () => {
    expect(canManageEvent({ id: "admin", role: "ADMIN" }, event)).toBe(true);
  });

  it("主催者でない member は管理できない", () => {
    expect(canManageEvent({ id: "someone", role: "MEMBER" }, event)).toBe(false);
  });
});

describe("assertCanManageEvent", () => {
  it("主催者でない member には 403 FORBIDDEN を投げる", () => {
    let thrown: unknown;
    try {
      assertCanManageEvent({ id: "someone", role: "MEMBER" }, event);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).code).toBe("FORBIDDEN");
    expect((thrown as AppError).status).toBe(403);
  });

  it("主催者には何も投げない", () => {
    expect(() => {
      assertCanManageEvent({ id: "organizer", role: "MEMBER" }, event);
    }).not.toThrow();
  });
});
