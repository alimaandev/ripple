import { describe, expect, it } from "vitest";
import { rippleConfigSchema } from "../../../src/config/schema.js";

describe("rippleConfigSchema diff", () => {
  it("defaults diff.gate to high", () => {
    const parsed = rippleConfigSchema.parse({});
    expect(parsed.diff).toEqual({ gate: "high", allow: [] });
  });

  it("fills the gate default when only base is set", () => {
    const parsed = rippleConfigSchema.parse({ diff: { base: "main" } });
    expect(parsed.diff).toEqual({ base: "main", gate: "high", allow: [] });
  });

  it("accepts an allowlist of globs", () => {
    const parsed = rippleConfigSchema.parse({
      diff: { allow: ["src/legacy/**", "src/generated/**"] },
    });
    expect(parsed.diff.allow).toEqual(["src/legacy/**", "src/generated/**"]);
  });

  it("rejects unknown gate values", () => {
    const result = rippleConfigSchema.safeParse({ diff: { gate: "severe" } });
    expect(result.success).toBe(false);
  });
});
