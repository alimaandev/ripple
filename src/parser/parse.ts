import type { Project, SourceFile } from "ts-morph";
import type { ParsedFile } from "../types/parser.js";
import { sourceFileKind } from "../utils/paths.js";
import { extractExports } from "./exports.js";
import { extractImports } from "./imports.js";
import { extractSymbols } from "./symbols.js";

/**
 * Parse one file into a `ParsedFile`. A parse failure must never abort the
 * analysis: the error is recorded and the file keeps an empty surface so it
 * still participates in the graph as a node.
 */
export function parseSourceFile(project: Project, filePath: string): ParsedFile {
  let sourceFile: SourceFile;
  try {
    sourceFile = project.addSourceFileAtPath(filePath);
  } catch (error) {
    return {
      path: filePath,
      kind: sourceFileKind(filePath) ?? "ts",
      imports: [],
      exports: { named: [], hasDefault: false, reExportedFrom: [], reExportedAll: [] },
      symbols: { functions: [], classes: [], interfaces: [], enums: [], typeAliases: [] },
      parseError: error instanceof Error ? error.message : String(error),
    };
  }

  try {
    return {
      path: filePath,
      kind: sourceFileKind(filePath) ?? "ts",
      imports: extractImports(sourceFile),
      exports: extractExports(sourceFile),
      symbols: extractSymbols(sourceFile),
    };
  } catch (error) {
    return {
      path: filePath,
      kind: sourceFileKind(filePath) ?? "ts",
      imports: [],
      exports: { named: [], hasDefault: false, reExportedFrom: [], reExportedAll: [] },
      symbols: { functions: [], classes: [], interfaces: [], enums: [], typeAliases: [] },
      parseError: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Parse many files, reusing the shared project. Never throws. */
export function parseMany(project: Project, filePaths: string[]): ParsedFile[] {
  return filePaths.map((filePath) => parseSourceFile(project, filePath));
}
