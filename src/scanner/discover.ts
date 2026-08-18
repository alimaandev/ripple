import { globFiles, toIgnoreGlob } from "../utils/globs.js";
import { isSourceFile } from "./rules.js";

/**
 * Recursive source-file discovery for a project.
 *
 * Combines the configured `include` globs with the configured `ignore`
 * entries (plain directory names are converted to catch-all globs) and
 * filters results down to source extensions. Files may match multiple
 * patterns; the result is deduplicated and sorted for determinism.
 */

export interface DiscoveryOptions {
  rootDir: string;
  include: string[];
  ignore: string[];
}

export async function discoverSourceFiles(options: DiscoveryOptions): Promise<string[]> {
  const ignoreGlobs = options.ignore
    .map(toIgnoreGlob)
    .filter((glob) => glob !== "")
    .concat(["**/node_modules/**", "**/.ripple/**"]);

  const files = await globFiles({
    cwd: options.rootDir,
    patterns: options.include,
    ignore: ignoreGlobs,
  });

  return files.filter(isSourceFile).sort((a, b) => a.localeCompare(b));
}
