import path from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path of a fixture directory, resolved from this file's location. */
export function fixturePath(...segments: string[]): string {
  const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
  return path.join(fixturesDir, ...segments);
}

export const basicFixture = fixturePath("basic");
