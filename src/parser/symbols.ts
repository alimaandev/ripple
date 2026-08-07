import type { SourceFile } from "ts-morph";
import type { SymbolInfo } from "../types/parser.js";

/**
 * Extract top-level declarations of a file. Used by the risk engine to
 * estimate the public surface and by categorization to classify files.
 */
export function extractSymbols(sourceFile: SourceFile): SymbolInfo {
  return {
    functions: sourceFile.getFunctions().map((fn) => fn.getName() ?? "(default)"),
    classes: sourceFile.getClasses().map((cls) => cls.getName() ?? "(default)"),
    interfaces: sourceFile.getInterfaces().map((iface) => iface.getName()),
    enums: sourceFile.getEnums().map((en) => en.getName()),
    typeAliases: sourceFile.getTypeAliases().map((alias) => alias.getName()),
  };
}
