import path from "node:path";
import { describe, expect, it } from "vitest";
import { basicFixture } from "../../helpers/fixtures.js";
import { discoverSourceFiles } from "../../../src/scanner/discover.js";
import { isSourceFile, SOURCE_EXTENSION_GLOB } from "../../../src/scanner/rules.js";
import { toPosix } from "../../../src/utils/paths.js";

const rootDir = path.join(basicFixture);

describe("discoverSourceFiles", () => {
  it("discovers all source files in the fixture", async () => {
    const files = await discoverSourceFiles({
      rootDir,
      include: ["**/*.{ts,tsx,js,jsx}"],
      ignore: ["node_modules", "dist"],
    });
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      expect(isSourceFile(file)).toBe(true);
    }
  });

  it("excludes ignored directories", async () => {
    const files = await discoverSourceFiles({
      rootDir,
      include: ["**/*.{ts,tsx,js,jsx}"],
      ignore: ["src/tests"],
    });
    const ignored = files.some((f) => toPosix(path.relative(rootDir, f)).includes("src/tests/"));
    expect(ignored).toBe(false);
  });

  it("is deterministic and deduplicated", async () => {
    const a = await discoverSourceFiles({ rootDir, include: ["**/*.ts"], ignore: [] });
    const b = await discoverSourceFiles({
      rootDir,
      include: ["**/*.ts", "src/**/*.ts"],
      ignore: [],
    });
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });

  it("finds nothing when include matches nothing", async () => {
    const files = await discoverSourceFiles({ rootDir, include: ["*.nomatch"], ignore: [] });
    expect(files).toEqual([]);
  });
});

describe("isSourceFile", () => {
  it("accepts source extensions", () => {
    expect(isSourceFile("a.ts")).toBe(true);
    expect(isSourceFile("a.tsx")).toBe(true);
    expect(isSourceFile("a.js")).toBe(true);
    expect(isSourceFile("a.jsx")).toBe(true);
  });

  it("rejects declaration files and others", () => {
    expect(isSourceFile("a.d.ts")).toBe(false);
    expect(isSourceFile("a.css")).toBe(false);
    expect(isSourceFile("a.json")).toBe(false);
  });
});

describe("SOURCE_EXTENSION_GLOB", () => {
  it("covers ts, tsx, js, jsx", () => {
    expect(SOURCE_EXTENSION_GLOB).toBe("*.{ts,tsx,js,jsx}");
  });
});
