import fs from "node:fs";
import path from "node:path";
import { Ajv } from "ajv";
import type { ValidateFunction } from "ajv";
import { describe, expect, it } from "vitest";
import { rippleConfigSchema } from "../../../src/config/schema.js";
import { DEFAULT_CONFIG } from "../../../src/config/defaults.js";

/**
 * Guards the committed `ripple.schema.json` (used by editors for
 * `ripple.config.json` autocomplete) against drift from the zod schema that
 * actually validates configs at runtime.
 */

const schemaPath = path.resolve("ripple.schema.json");

function compileSchema(): ValidateFunction {
  const raw = JSON.parse(fs.readFileSync(schemaPath, "utf8")) as object;
  const ajv = new Ajv({ strict: true, allErrors: true });
  const validate = ajv.compile(raw);
  expect(validate).toBeDefined();
  return validate;
}

describe("ripple.schema.json", () => {
  const validate = compileSchema();

  it("describes every config section", () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8")) as {
      properties: Record<string, unknown>;
    };
    expect(schema.properties).toMatchObject({
      include: {},
      ignore: {},
      aliases: {},
      tsconfigPath: {},
      risk: {},
      diff: {},
      $schema: {},
    });
  });

  it("validates the full default config", () => {
    const parsed = rippleConfigSchema.parse({});
    expect(validate(parsed)).toBe(true);
  });

  it("validates a representative user config with $schema and allowlist", () => {
    const config = {
      $schema: "./node_modules/@alimaandev/ripple/ripple.schema.json",
      include: ["src/**/*.ts"],
      ignore: ["src/generated/**"],
      aliases: { "@": "./src" },
      tsconfigPath: "tsconfig.base.json",
      risk: {
        weights: { affectedFiles: 0.4 },
        thresholds: { medium: 20, high: 50, critical: 85 },
      },
      diff: { base: "origin/main", gate: "medium", allow: ["src/legacy/**"] },
    };
    expect(validate(config)).toBe(true);
    expect(rippleConfigSchema.safeParse(config).success).toBe(true);
  });

  it("matches the runtime schema's strictness on unknown keys", () => {
    const unknownKey = { ...DEFAULT_CONFIG, bogus: 1 };
    expect(validate(unknownKey)).toBe(false);
    expect(rippleConfigSchema.safeParse(unknownKey).success).toBe(false);
  });

  it("matches the runtime schema's gate enum", () => {
    const badGate = { ...DEFAULT_CONFIG, diff: { gate: "severe" } };
    expect(validate(badGate)).toBe(false);
    expect(rippleConfigSchema.safeParse(badGate).success).toBe(false);
  });
});
