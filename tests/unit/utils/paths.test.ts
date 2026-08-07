import { describe, expect, it } from "vitest";
import {
  displayPath,
  firstSegment,
  isBareSpecifier,
  isRelativeSpecifier,
  jsToTsCandidate,
  pathKey,
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
