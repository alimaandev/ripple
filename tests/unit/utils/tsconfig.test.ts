import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { basicFixture } from "../../helpers/fixtures.js";
import { findTsconfig, matchAlias, readTsconfig } from "../../../src/utils/tsconfig.js";
import { toPosix } from "../../../src/utils/paths.js";

describe("findTsconfig", () => {
  it("finds the tsconfig above the start directory", () => {
    const found = findTsconfig(path.join(basicFixture, "src", "auth"));
    expect(toPosix(found ?? "")).toBe(toPosix(path.join(basicFixture, "tsconfig.json")));
  });

  it("returns undefined when none exists above", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ripple-no-tsconfig-"));
    try {
      expect(findTsconfig(tempDir)).toBeUndefined();
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("readTsconfig", () => {
  it("reads paths, baseUrl, include and exclude", () => {
    const info = readTsconfig(path.join(basicFixture, "tsconfig.json"));
    expect(info).toBeDefined();
    expect(info!.dir).toBe(basicFixture);
    expect(info!.baseUrl).toBe(basicFixture);
    expect(info!.paths["@/*"]).toEqual(["./src/*"]);
    expect(info!.include).toEqual(["src/**/*"]);
    expect(info!.exclude).toEqual(["node_modules", "dist"]);
  });

  it("returns undefined for a missing file", () => {
    expect(readTsconfig(path.join(basicFixture, "nope.json"))).toBeUndefined();
  });
});

describe("matchAlias", () => {
  const paths = {
    "@/*": ["./src/*"],
    "@components": ["./src/components/index.ts"],
    "old-pkg": ["./src/shims/old.ts", "./src/shims/older.ts"],
  };

  it("matches star patterns and substitutes the captured value", () => {
    expect(matchAlias("@/auth/login", paths)).toEqual({
      target: "./src/auth/login",
      matchedPattern: "@/*",
    });
  });

  it("matches exact patterns", () => {
    expect(matchAlias("@components", paths)).toEqual({
      target: "./src/components/index.ts",
      matchedPattern: "@components",
    });
  });

  it("uses the first replacement pattern", () => {
    expect(matchAlias("old-pkg", paths)).toEqual({
      target: "./src/shims/old.ts",
      matchedPattern: "old-pkg",
    });
  });

  it("returns undefined when nothing matches", () => {
    expect(matchAlias("react", paths)).toBeUndefined();
    expect(matchAlias("@auth/login", paths)).toBeUndefined();
  });
});
