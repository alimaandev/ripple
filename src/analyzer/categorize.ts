import path from "node:path";
import { findPackageJson, pathExistsSync, readPackageEntryPoints } from "../utils/fs.js";
import { toPosix } from "../utils/paths.js";
import type { Category } from "../types/analysis.js";

/**
 * Deterministic file categorization heuristics.
 *
 * A file can match several categories (a `page.tsx` is both a route and a
 * component). Everything here is path/name based — no source analysis — so
 * categorization is cheap, stable and easy to document.
 */

const ROUTE_FILE_NAMES = new Set([
  "route",
  "page",
  "layout",
  "middleware",
  "loading",
  "error",
  "not-found",
]);

const ROUTE_DIR_NAMES = new Set(["routes", "api"]);

const UTILITY_DIR_NAMES = new Set(["lib", "utils", "helpers", "shared", "common", "core"]);

const COMPONENT_DIR_NAMES = new Set(["components", "ui"]);

const ENTRY_FILE_NAMES = new Set(["index", "main", "app", "server", "cli", "bin"]);

const TEST_SEGMENT = "__tests__";

function relativeSegments(filePath: string, rootDir: string): string[] {
  const relative = toPosix(path.relative(rootDir, filePath));
  if (relative.startsWith("..")) return [];
  return relative.split("/").filter((segment) => segment !== "" && segment !== ".");
}

function isRouteFile(basename: string): boolean {
  return ROUTE_FILE_NAMES.has(basename);
}

function isTestFile(name: string, segments: string[]): boolean {
  if (segments.includes(TEST_SEGMENT)) return true;
  if (/(^|[._-])(test|spec)([._-]|$)/i.test(name)) return true;
  return segments.some((segment) => segment === "tests");
}

function isComponentFile(basename: string, extension: string, segments: string[]): boolean {
  if (extension === "tsx" || extension === "jsx") return true;
  if (!COMPONENT_DIR_NAMES.has(segments.at(-2) ?? "")) return false;
  return /^[A-Z]/.test(basename);
}

function isUtilityFile(segments: string[]): boolean {
  return segments.some((segment) => UTILITY_DIR_NAMES.has(segment));
}

function isEntryFile(filePath: string, rootDir: string, entryPoints: Set<string>): boolean {
  if (entryPoints.has(path.normalize(filePath))) return true;

  const relative = toPosix(path.relative(rootDir, filePath));
  if (relative.startsWith("..")) return false;
  const segments = relative.split("/");
  if (segments.length !== 2) return false;
  if (segments[0] !== "src" && segments[0] !== "") return false;

  const basename = segments[1] ?? "";
  const dot = basename.lastIndexOf(".");
  const name = dot === -1 ? basename : basename.slice(0, dot);
  return ENTRY_FILE_NAMES.has(name);
}

export interface CategorizerOptions {
  rootDir: string;
  /** Absolute paths of entry points (package.json `main`/`bin`, conventions). */
  entryPoints: Set<string>;
}

/**
 * Create a categorizer bound to a project. Returns a function that classifies
 * an absolute file path into zero or more categories.
 */
export function createCategorizer(options: CategorizerOptions): (filePath: string) => Category[] {
  const { rootDir, entryPoints } = options;

  return (filePath: string): Category[] => {
    const segments = relativeSegments(filePath, rootDir);
    const basename = segments.at(-1) ?? "";
    const dot = basename.lastIndexOf(".");
    const name = dot === -1 ? basename : basename.slice(0, dot);
    const extension = dot === -1 ? "" : basename.slice(dot + 1).toLowerCase();

    const categories: Category[] = [];

    if (isRouteFile(name)) categories.push("route");
    else if (segments.some((segment) => ROUTE_DIR_NAMES.has(segment))) categories.push("route");

    if (isTestFile(name, segments)) categories.push("test");
    if (isComponentFile(name, extension, segments)) categories.push("component");
    if (isUtilityFile(segments)) categories.push("utility");
    if (isEntryFile(filePath, rootDir, entryPoints)) categories.push("entry");
    if (categories.length === 0) categories.push("other");

    return categories;
  };
}

/**
 * Detect entry points: package.json `main`/`bin` plus conventional root
 * entry file names (in the project root or `src/`).
 */
export async function detectEntryPoints(rootDir: string): Promise<Set<string>> {
  const started = Date.now();
  const entryPoints = new Set<string>();

  const packageJsonPath = await findPackageJson(rootDir);
  if (packageJsonPath) {
    const packageDir = path.dirname(packageJsonPath);
    for (const entry of await readPackageEntryPoints(packageJsonPath)) {
      const absolute = path.resolve(packageDir, entry);
      if (pathExistsSync(absolute)) entryPoints.add(path.normalize(absolute));
    }
  }

  const baseDirs = [rootDir, path.join(rootDir, "src")];
  for (const baseDir of baseDirs) {
    for (const name of ENTRY_FILE_NAMES) {
      for (const extension of ["ts", "tsx", "js", "jsx"]) {
        const candidate = path.join(baseDir, `${name}.${extension}`);
        if (pathExistsSync(candidate)) entryPoints.add(path.normalize(candidate));
      }
    }
  }

  if (process.env.RIPPLE_TRACE === "1") {
    console.error(`[trace] detectEntryPoints: ${Date.now() - started}ms`);
  }
  return entryPoints;
}
