import type { SourceFile } from "ts-morph";
import type { ExportInfo } from "../types/parser.js";

/**
 * Extract the public export surface of a file:
 *
 * - `export const x`, `export function x`, `export class X`, ... (declarations)
 * - `export default ...`
 * - re-exports: `export { x } from "..."` and `export * from "..."`
 */
export function extractExports(sourceFile: SourceFile): ExportInfo {
  const named: string[] = [];
  const reExportedFrom: string[] = [];
  const reExportedAll: string[] = [];

  for (const decl of sourceFile.getExportDeclarations()) {
    const specifier = decl.getModuleSpecifierValue();
    const namedExports = decl.getNamedExports();

    if (specifier) {
      if (namedExports.length === 0) {
        reExportedAll.push(specifier);
      } else {
        reExportedFrom.push(specifier);
      }
      continue;
    }

    for (const namedExport of namedExports) {
      named.push(namedExport.getName());
    }
  }

  for (const statement of sourceFile.getVariableStatements()) {
    if (!statement.isExported()) continue;
    for (const declaration of statement.getDeclarations()) {
      named.push(declaration.getName());
    }
  }

  for (const fn of sourceFile.getFunctions()) {
    if (!fn.isExported()) continue;
    const name = fn.getName();
    if (name) named.push(name);
  }

  for (const cls of sourceFile.getClasses()) {
    if (!cls.isExported()) continue;
    const name = cls.getName();
    if (name) named.push(name);
  }

  for (const en of sourceFile.getEnums()) {
    if (!en.isExported()) continue;
    const name = en.getName();
    if (name) named.push(name);
  }

  for (const iface of sourceFile.getInterfaces()) {
    if (!iface.isExported()) continue;
    named.push(iface.getName());
  }

  for (const alias of sourceFile.getTypeAliases()) {
    if (!alias.isExported()) continue;
    named.push(alias.getName());
  }

  const hasDefault =
    sourceFile.getExportAssignments().length > 0 ||
    sourceFile.getFunctions().some((fn) => fn.isDefaultExport()) ||
    sourceFile.getClasses().some((cls) => cls.isDefaultExport());

  named.sort();
  return { named, hasDefault, reExportedFrom, reExportedAll };
}
