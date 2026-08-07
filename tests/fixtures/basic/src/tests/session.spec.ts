import { describe, expect, it } from "vitest";
import { createSession } from "../session/manager";

describe("session", () => {
  it("assigns an id", () => {
    const session = createSession("u");
    expect(session.id).toBeTruthy();
  });
});
