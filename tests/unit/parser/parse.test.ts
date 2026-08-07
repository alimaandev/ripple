import path from "node:path";
import { describe, expect, it } from "vitest";
import { basicFixture } from "../../helpers/fixtures.js";
import { createTsProject } from "../../../src/parser/ts-project.js";
import { parseSourceFile } from "../../../src/parser/parse.js";
import { extractImports } from "../../../src/parser/imports.js";

const project = createTsProject();

describe("parseSourceFile", () => {
  it("parses imports, exports and symbols of a tsx component", () => {
    const parsed = parseSourceFile(
      project,
      path.join(basicFixture, "src", "components", "Button.tsx"),
    );
    expect(parsed.kind).toBe("tsx");
    expect(parsed.imports).toContainEqual(
      expect.objectContaining({ raw: "react", kind: "import", isTypeOnly: true }),
    );
    expect(parsed.exports.hasDefault).toBe(true);
    expect(parsed.exports.named).toEqual(["Button", "buttonClass"]);
    expect(parsed.symbols.functions).toEqual(["Button"]);
    expect(parsed.parseError).toBeUndefined();
  });

  it("captures re-exports and export-all", () => {
    const parsed = parseSourceFile(
      project,
      path.join(basicFixture, "src", "components", "index.ts"),
    );
    expect(parsed.exports.reExportedFrom).toEqual(["./Button"]);
    expect(parsed.exports.reExportedAll).toEqual(["./Icon"]);
    expect(parsed.imports.map((i) => i.kind)).toEqual(["export-from", "export-from"]);
  });

  it("captures type-only specifiers with aliases", () => {
    const parsed = parseSourceFile(
      project,
      path.join(basicFixture, "src", "authentication", "login.ts"),
    );
    const typeImport = parsed.imports.find((i) => i.raw === "../shared/types");
    expect(typeImport?.isTypeOnly).toBe(false);
    expect(typeImport?.specifiers).toEqual([{ name: "Role", isType: true }]);
  });

  it("captures require and dynamic imports", () => {
    const parsed = parseSourceFile(project, path.join(basicFixture, "src", "legacy.ts"));
    const kinds = parsed.imports.map((i) => `${i.kind}:${i.raw}`).sort();
    expect(kinds).toContain("require:./legacy/helper");
    expect(kinds).toContain("dynamic:./utils/format");
    expect(kinds).toContain("import:./shared/constants");
  });

  it("parses plain JavaScript files", () => {
    const parsed = parseSourceFile(project, path.join(basicFixture, "src", "legacy", "helper.js"));
    expect(parsed.kind).toBe("js");
    expect(parsed.exports.named).toEqual(["legacyFormat", "legacyName"]);
    expect(parsed.parseError).toBeUndefined();
  });

  it("records a parse error without throwing for unreadable files", () => {
    const parsed = parseSourceFile(project, path.join(basicFixture, "src", "does-not-exist.ts"));
    expect(parsed.parseError).toBeDefined();
    expect(parsed.imports).toEqual([]);
  });
});

describe("extractImports", () => {
  it("returns an empty array for a file without imports", () => {
    const sourceFile = project.addSourceFileAtPath(
      path.join(basicFixture, "src", "shared", "types.ts"),
    );
    expect(extractImports(sourceFile)).toEqual([]);
  });
});
