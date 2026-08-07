import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";

/**
 * Thin, safe filesystem helpers. All reads are optional: Ripple must never
 * crash the whole analysis because one file is unreadable.
 */

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function pathExistsSync(filePath: string): boolean {
  try {
    fsSync.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Read a file as UTF-8; returns `undefined` when unreadable. */
export async function readFileSafe(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return undefined;
  }
}

/** Read a small JSON-ish file synchronously; returns `undefined` when unreadable. */
export function readJsonSafe(filePath: string): unknown | undefined {
  try {
    return JSON.parse(fsSync.readFileSync(filePath, "utf8"));
  } catch {
    return undefined;
  }
}

/**
 * Find the closest package.json above `startDir`. Used to detect project
 * entry points (`main`, `bin`).
 */
export async function findPackageJson(startDir: string): Promise<string | undefined> {
  let current = path.resolve(startDir);
  for (;;) {
    const candidate = path.join(current, "package.json");
    if (await pathExists(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

/** Read `main` / `bin` entries of a package.json for entry-point detection. */
export async function readPackageEntryPoints(packageJsonPath: string): Promise<string[]> {
  const raw = await readFileSafe(packageJsonPath);
  if (!raw) return [];
  try {
    const manifest = JSON.parse(raw) as { main?: string; bin?: string | Record<string, string> };
    const entries: string[] = [];
    if (typeof manifest.main === "string") entries.push(manifest.main);
    if (typeof manifest.bin === "string") entries.push(manifest.bin);
    if (manifest.bin && typeof manifest.bin === "object")
      entries.push(...Object.values(manifest.bin));
    return entries;
  } catch {
    return [];
  }
}
