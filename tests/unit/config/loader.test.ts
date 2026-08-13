import path from "node:path";
import { describe, expect, it } from "vitest";
import { fixturePath } from "../../helpers/fixtures.js";
import { loadConfig, loadProjectContext } from "../../../src/config/loader.js";
import { RippleError } from "../../../src/utils/errors.js";
import { ExitCode } from "../../../src/types/cli.js";
import { DEFAULT_CONFIG } from "../../../src/config/defaults.js";

const configsDir = fixturePath("configs");

describe("loadConfig", () => {
  it("returns defaults when no config exists", async () => {
    const result = await loadConfig(configsDir);
    expect(result.config).toEqual(DEFAULT_CONFIG);
    expect(result.configPath).toBeUndefined();
  });

  it("loads a ripple.config.ts and merges with defaults", async () => {
    const result = await loadConfig(configsDir, "valid.ts");
    expect(result.configPath).toBe(path.join(configsDir, "valid.ts"));
    expect(result.rootDir).toBe(configsDir);
    expect(result.config.ignore).toEqual(["dist", "coverage"]);
    expect(result.config.aliases).toEqual({ "@": "./src" });
    expect(result.config.risk.thresholds.medium).toBe(40);
    expect(result.config.risk.thresholds.high).toBe(55);
    expect(result.config.risk.weights.affectedFiles).toBe(0.3);
    expect(result.config.include).toEqual(["**/*.{ts,tsx,js,jsx}"]);
  });

  it("loads a json config", async () => {
    const result = await loadConfig(configsDir, "basic.json");
    expect(result.config.ignore).toEqual(["out", "build"]);
    expect(result.config.aliases).toEqual({});
  });

  it("loads diff settings from a json config", async () => {
    const result = await loadConfig(configsDir, "diff.json");
    expect(result.config.diff).toEqual({ base: "origin/release", gate: "critical", allow: [] });
  });

  it("throws for an explicit path that does not exist", async () => {
    await expect(loadConfig(configsDir, "missing.ts")).rejects.toThrow(RippleError);
    try {
      await loadConfig(configsDir, "missing.ts");
    } catch (error) {
      expect((error as RippleError).exitCode).toBe(ExitCode.InvalidConfig);
    }
  });

  it("throws with a friendly message for invalid configs", async () => {
    await expect(loadConfig(configsDir, "invalid.ts")).rejects.toThrow(/Invalid config/);
  });

  it("throws when the config exports a function", async () => {
    await expect(loadConfig(configsDir, "function.ts")).rejects.toThrow(/plain object/);
  });
});

describe("loadProjectContext", () => {
  it("resolves tsconfig and merges aliases", async () => {
    const ctx = await loadProjectContext(fixturePath("basic"));
    expect(ctx.rootDir).toBe(fixturePath("basic"));
    expect(ctx.tsconfig?.paths["@/*"]).toEqual(["./src/*"]);
    expect(ctx.aliases["@/*"]).toContain("src");
  });

  it("overrides tsconfig paths with user aliases on collision", async () => {
    const aliasesDir = fixturePath("aliases");
    const ctx = await loadProjectContext(aliasesDir);
    expect(ctx.aliases["@/*"]).toBe(path.join(aliasesDir, "app", "*"));
  });
});
