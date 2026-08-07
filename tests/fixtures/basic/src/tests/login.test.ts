import { describe, expect, it } from "vitest";
import { loginUser } from "../authentication/login";

describe("login", () => {
  it("creates a session for a user", () => {
    expect(loginUser("u", "p").role).toBe("user");
  });
});
