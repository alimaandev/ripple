import { SyntaxKind, type ImportEqualsDeclaration, type SourceFile } from "ts-morph";
import type { ImportDeclaration, ImportSpecifier } from "../types/parser.js";

/**
 * Extract every module specifier a file depends on:
 *
 * - `import ... from "x"` / bare `import "x"`
 * - `export { ... } from "x"` / `export * from "x"`
 * - `import("x")` dynamic imports
 * - `require("x")` and `import x = require("x")`
 *
 * Only statically analyzable string-literal specifiers are reported.
 */

function specifierFor(
  imported: string,
  alias: string | undefined,
  isType: boolean,
): ImportSpecifier {
  return alias && alias !== imported
    ? { name: imported, alias, isType }
    : { name: imported, isType };
}

export function extractImports(sourceFile: SourceFile): ImportDeclaration[] {
  const declarations: ImportDeclaration[] = [];

  for (const decl of sourceFile.getImportDeclarations()) {
    declarations.push({
      raw: decl.getModuleSpecifierValue(),
      kind: "import",
      isTypeOnly: decl.isTypeOnly(),
      specifiers: decl
        .getNamedImports()
        .map((named) =>
          specifierFor(named.getName(), named.getAliasNode()?.getText(), named.isTypeOnly()),
        ),
    });
  }

  for (const decl of sourceFile.getExportDeclarations()) {
    const specifier = decl.getModuleSpecifierValue();
    if (!specifier) continue;
    declarations.push({
      raw: specifier,
      kind: "export-from",
      isTypeOnly: decl.isTypeOnly(),
      specifiers: decl
        .getNamedExports()
        .map((named) =>
          specifierFor(named.getName(), named.getAliasNode()?.getText(), named.isTypeOnly()),
        ),
    });
  }

  const importEqualsNodes = sourceFile
    .getDescendantsOfKind(SyntaxKind.ImportEqualsDeclaration)
    .map((node) => node as ImportEqualsDeclaration);
  for (const decl of importEqualsNodes) {
    const literal = decl.getFirstDescendantByKind(SyntaxKind.StringLiteral);
    if (literal) {
      declarations.push({
        raw: literal.getLiteralText(),
        kind: "require",
        isTypeOnly: false,
        specifiers: [],
      });
    }
  }

  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression().getText();
    if (callee !== "require" && callee !== "import") continue;
    const argument = call.getArguments()[0];
    if (!argument?.isKind(SyntaxKind.StringLiteral)) continue;
    declarations.push({
      raw: argument.getLiteralText(),
      kind: callee === "require" ? "require" : "dynamic",
      isTypeOnly: false,
      specifiers: [],
    });
  }

  return declarations;
}
