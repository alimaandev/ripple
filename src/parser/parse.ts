import type { DiagnosticWithLocation, Project, SourceFile } from "ts-morph";
import type { ParsedFile, SourceFileKind } from "../types/parser.js";
import { pathKey, sourceFileKind } from "../utils/paths.js";
import { extractExports } from "./exports.js";
import { extractImports } from "./imports.js";
import { extractSymbols } from "./symbols.js";

/**
 * Parse files into `ParsedFile`s. A parse failure must never abort the
 * analysis: the error is recorded and the file keeps an empty surface so it
 * still participates in the graph as a node.
 *
 * Syntactic diagnostics are checked after all files in a batch have been
 * added, so the shared ts-morph project builds one compiler program for the
 * whole batch instead of one per file.
 */

const MAX_REPORTED_DIAGNOSTICS = 3;

function diagnosticText(diagnostic: DiagnosticWithLocation): string {
  const message = diagnostic.getMessageText();
  return typeof message === "string" ? message : message.getMessageText();
}

function formatDiagnostics(diagnostics: DiagnosticWithLocation[]): string {
  const parts = diagnostics.slice(0, MAX_REPORTED_DIAGNOSTICS).map((diagnostic) => {
    const line = diagnostic.getLineNumber();
    return `${line !== undefined ? `line ${line}: ` : ""}${diagnosticText(diagnostic)}`;
  });
  const suffix =
    diagnostics.length > MAX_REPORTED_DIAGNOSTICS
      ? ` (+${diagnostics.length - MAX_REPORTED_DIAGNOSTICS} more)`
      : "";
  return `${parts.join("; ")}${suffix}`;
}

/**
 * Syntactic diagnostics are the compiler's way of saying "this file is not
 * valid TypeScript". ts-morph still returns a `SourceFile` for such files, so
 * an extractor-only check would report them as parsed cleanly.
 */
function collectSyntacticErrors(project: Project, filePaths: string[]): Map<string, string> {
  const errors = new Map<string, string>();
  if (filePaths.length === 0) return errors;

  const targets = new Set(filePaths.map((filePath) => pathKey(filePath, process.cwd())));
  let diagnostics: DiagnosticWithLocation[];
  try {
    diagnostics = project.getProgram().getSyntacticDiagnostics();
  } catch {
    return errors;
  }

  const byFile = new Map<string, DiagnosticWithLocation[]>();
  for (const diagnostic of diagnostics) {
    const key = pathKey(diagnostic.getSourceFile().getFilePath(), process.cwd());
    if (!targets.has(key)) continue;
    const list = byFile.get(key) ?? [];
    list.push(diagnostic);
    byFile.set(key, list);
  }
  for (const [key, list] of byFile) {
    errors.set(key, formatDiagnostics(list));
  }
  return errors;
}

function emptySurface(filePath: string, kind: SourceFileKind, parseError: string): ParsedFile {
  return {
    path: filePath,
    kind,
    imports: [],
    exports: { named: [], hasDefault: false, reExportedFrom: [], reExportedAll: [] },
    symbols: { functions: [], classes: [], interfaces: [], enums: [], typeAliases: [] },
    parseError,
  };
}

/** Add one file and extract its surface; syntax is checked by the caller. */
function parseSurface(project: Project, filePath: string): ParsedFile {
  const kind = sourceFileKind(filePath) ?? "ts";

  let sourceFile: SourceFile;
  try {
    sourceFile = project.addSourceFileAtPath(filePath);
  } catch (error) {
    return emptySurface(filePath, kind, error instanceof Error ? error.message : String(error));
  }

  try {
    return {
      path: filePath,
      kind,
      imports: extractImports(sourceFile),
      exports: extractExports(sourceFile),
      symbols: extractSymbols(sourceFile),
    };
  } catch (error) {
    return emptySurface(filePath, kind, error instanceof Error ? error.message : String(error));
  }
}

/** Parse one file. Convenience wrapper used by tests and single-file callers. */
export function parseSourceFile(project: Project, filePath: string): ParsedFile {
  return parseMany(project, [filePath])[0]!;
}

/** Parse many files, reusing the shared project. Never throws. */
export function parseMany(project: Project, filePaths: string[]): ParsedFile[] {
  const parsed = filePaths.map((filePath) => parseSurface(project, filePath));
  const syntaxErrors = collectSyntacticErrors(project, filePaths);

  return parsed.map((parsedFile) => {
    if (parsedFile.parseError !== undefined) return parsedFile;
    const error = syntaxErrors.get(pathKey(parsedFile.path, process.cwd()));
    return error === undefined ? parsedFile : emptySurface(parsedFile.path, parsedFile.kind, error);
  });
}
