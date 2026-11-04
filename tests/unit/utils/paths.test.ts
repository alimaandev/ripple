import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  displayPath,
  firstSegment,
  isBareSpecifier,
  isRelativeSpecifier,
  jsToTsCandidate,
  jsToTsCandidates,
  pathKey,
  realPath,
  sourceFileKind,
  toPosix,
} from "../../../src/utils/paths.js";

/** Windows-only tests: drive-letter paths are not real paths on POSIX. */
const isWin = process.platform === "win32";

describe("toPosix", () => {
  it("converts backslashes", () => {
    expect(toPosix("src\\auth\\login.ts")).toBe("src/auth/login.ts");
  });

  it("leaves posix paths untouched", () => {
    expect(toPosix("src/auth/login.ts")).toBe("src/auth/login.ts");
  });
});

describe.skipIf(!isWin)("pathKey", () => {
  it("is absolute and case-normalized on win32", () => {
    const cwd = "C:\\proj";
    const key = pathKey("c:/proj/./src/Auth/Login.ts", cwd);
    expect(key).toBe("c:/proj/src/auth/login.ts");
  });
});

describe("realPath", () => {
  it("returns the canonical path for an existing file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ripple-realpath-"));
    try {
      const file = path.join(dir, "a.ts");
      fs.writeFileSync(file, "export const a = 1;\n");
      expect(realPath(file, dir)).toBe(fs.realpathSync.native(file));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("falls back to an absolute path when the target does not exist", () => {
    const missing = path.join(os.tmpdir(), `ripple-missing-${process.pid}.ts`);
    expect(realPath(missing, os.tmpdir())).toBe(path.resolve(missing));
  });
});

describe("specifier classification", () => {
  it("detects relative imports", () => {
    expect(isRelativeSpecifier("./x")).toBe(true);
    expect(isRelativeSpecifier("../x")).toBe(true);
    expect(isRelativeSpecifier("@/x")).toBe(false);
    expect(isRelativeSpecifier("react")).toBe(false);
  });

  it("detects bare imports", () => {
    expect(isBareSpecifier("react")).toBe(true);
    expect(isBareSpecifier("@scope/pkg")).toBe(true);
    expect(isBareSpecifier("./x")).toBe(false);
    expect(isBareSpecifier("/abs")).toBe(false);
  });
});

describe("sourceFileKind", () => {
  it("maps extensions to kinds", () => {
    expect(sourceFileKind("a.ts")).toBe("ts");
    expect(sourceFileKind("a.TSX")).toBe("tsx");
    expect(sourceFileKind("a.js")).toBe("js");
    expect(sourceFileKind("a.jsx")).toBe("jsx");
    expect(sourceFileKind("a.mts")).toBe("mts");
    expect(sourceFileKind("a.cts")).toBe("cts");
    expect(sourceFileKind("a.mjs")).toBe("mjs");
    expect(sourceFileKind("a.cjs")).toBe("cjs");
  });

  it("rejects other extensions", () => {
    expect(sourceFileKind("a.css")).toBeUndefined();
    expect(sourceFileKind("a.d.ts")).toBeUndefined();
  });
});

describe("jsToTsCandidate", () => {
  it("swaps js extensions to ts equivalents", () => {
    expect(jsToTsCandidate("src/x.js")).toBe("src/x.ts");
    expect(jsToTsCandidate("src/x.jsx")).toBe("src/x.tsx");
    expect(jsToTsCandidate("src/x.mjs")).toBe("src/x.mts");
    expect(jsToTsCandidate("src/x.cjs")).toBe("src/x.cts");
    expect(jsToTsCandidate("src/x.ts")).toBe("src/x.ts");
  });

  it("offers tsx as a second candidate for js specifiers", () => {
    expect(jsToTsCandidates("src/x.js")).toEqual(["src/x.ts", "src/x.tsx"]);
    expect(jsToTsCandidates("src/x.ts")).toEqual([]);
  });
});

describe.skipIf(!isWin)("displayPath", () => {
  it("produces posix relative paths", () => {
    expect(displayPath("F:\\proj\\src\\a.ts", "F:\\proj")).toBe("src/a.ts");
  });
});

describe.skipIf(!isWin)("firstSegment", () => {
  it("returns the first directory segment below the root", () => {
    expect(firstSegment("F:\\proj\\src\\auth\\login.ts", "F:\\proj\\src")).toBe("auth");
    expect(firstSegment("F:\\proj\\src\\login.ts", "F:\\proj\\src")).toBe("login.ts");
  });

  it("returns undefined for files outside the root", () => {
    expect(firstSegment("F:\\other\\x.ts", "F:\\proj\\src")).toBeUndefined();
  });
});
