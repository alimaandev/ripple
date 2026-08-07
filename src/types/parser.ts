/**
 * Low-level parse results produced by `src/parser/`.
 *
 * These describe *one file* in isolation: what it imports, what it exports and
 * which symbols it declares. Resolution of specifiers to files happens later
 * in `src/graph/`.
 */

/** Source file kinds Ripple analyzes. */
export type SourceFileKind = "ts" | "tsx" | "js" | "jsx";

/** One named import/export binding. */
export interface ImportSpecifier {
  /** The imported (or local) identifier as written. */
  name: string;
  /** Local alias if the binding is renamed, e.g. `import { a as b }`. */
  alias?: string;
  /** Whether the binding is type-only (`import type { T }`). */
  isType: boolean;
}

/** How the module specifier appears in the source. */
export type ImportKind = "import" | "export-from" | "require" | "dynamic";

export interface ImportDeclaration {
  /** The module specifier exactly as written, e.g. `../utils/format`. */
  raw: string;
  kind: ImportKind;
  /** Empty for bare `import "./x"` and `export * from "./x"`. */
  specifiers: ImportSpecifier[];
  /** Whether the whole declaration is type-only (`import type * as ns`). */
  isTypeOnly: boolean;
}

export interface ExportInfo {
  /** Names of named exports declared in this file. */
  named: string[];
  /** Whether the file has a default export. */
  hasDefault: boolean;
  /** Raw specifiers re-exported via `export { x } from "..."`. */
  reExportedFrom: string[];
  /** Raw specifiers re-exported wholesale via `export * from "..."`. */
  reExportedAll: string[];
}

export interface SymbolInfo {
  functions: string[];
  classes: string[];
  interfaces: string[];
  enums: string[];
  typeAliases: string[];
}

/** Full parse result for a single file. */
export interface ParsedFile {
  /** Absolute path of the parsed file. */
  path: string;
  kind: SourceFileKind;
  imports: ImportDeclaration[];
  exports: ExportInfo;
  symbols: SymbolInfo;
  /** Present when the file could not be parsed; analysis continues anyway. */
  parseError?: string;
}

/**
 * Count of every declared symbol. Sum of `SymbolInfo` arrays.
 */
export function symbolCount(symbols: SymbolInfo): number {
  return (
    symbols.functions.length +
    symbols.classes.length +
    symbols.interfaces.length +
    symbols.enums.length +
    symbols.typeAliases.length
  );
}
