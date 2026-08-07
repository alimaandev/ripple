import path from "node:path";
import { describe, expect, it } from "vitest";
import { basicFixture } from "../../helpers/fixtures.js";
import { globFiles, toIgnoreGlob } from "../../../src/utils/globs.js";

describe("globFiles", () => {
  it("discovers ts/tsx/js/jsx files, deduplicated, absolute", async () => {
    const files = await globFiles({
      cwd: basicFixture,
      patterns: ["src/**/*.{ts,tsx}"],
      ignore: ["**/node_modules/**"],
    });
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(path.isAbsolute(file)).toBe(true);
      expect(file.endsWith(".ts") || file.endsWith(".tsx")).toBe(true);
    }
    expect(new Set(files).size).toBe(files.length);
  });

  it("honors ignore patterns", async () => {
    const files = await globFiles({
      cwd: basicFixture,
      patterns: ["**/*.{ts,tsx}"],
      ignore: ["**/src/tests/**"],
    });
    expect(files.some((f) => f.includes(`${path.sep}tests${path.sep}`))).toBe(false);
  });

  it("returns an empty array for an empty project", async () => {
    const files = await globFiles({ cwd: basicFixture, patterns: ["*.xyz"], ignore: [] });
    expect(files).toEqual([]);
  });
});

describe("toIgnoreGlob", () => {
  it("converts plain names to catch-all patterns", () => {
    expect(toIgnoreGlob("dist")).toBe("**/dist/**");
  });

  it("keeps glob patterns as-is", () => {
    expect(toIgnoreGlob("**/generated/**")).toBe("**/generated/**");
  });

  it("returns an empty string for empty input", () => {
    expect(toIgnoreGlob("///")).toBe("");
  });
});
