import { createJiti } from "jiti";
import path from "node:path";
import { ExitCode } from "../types/cli.js";
import type { AliasMap, RippleConfig } from "../types/config.js";
import type { LoadConfigResult, ProjectContext } from "../types/project.js";
import { pathExistsSync } from "../utils/fs.js";
import { RippleError } from "../utils/errors.js";
import { readTsconfig } from "../utils/tsconfig.js";
import { buildAliasMap } from "./aliases.js";
import { formatSchemaIssues, rippleConfigSchema } from "./schema.js";

/**
 * Config discovery and loading.
 *
 * Resolution order for `ripple.config.*`: `.ts`, `.mjs`, `.js`, `.cjs`,
 * `.json`. An explicit `--config <path>` always wins. The directory of the
 * resolved config file becomes the project root.
 */

const CONFIG_CANDIDATES = [
  "ripple.config.ts",
  "ripple.config.mjs",
  "ripple.config.js",
  "ripple.config.cjs",
  "ripple.config.json",
] as const;

const jiti = createJiti(import.meta.url, { interopDefault: true });

function findConfigFile(cwd: string, explicitPath: string | undefined): string | undefined {
  if (explicitPath) return path.resolve(cwd, explicitPath);
  for (const candidate of CONFIG_CANDIDATES) {
    const absolute = path.join(cwd, candidate);
    if (pathExistsSync(absolute)) return absolute;
  }
  return undefined;
}

async function importConfig(configPath: string): Promise<unknown> {
  let loaded: unknown;
  try {
    loaded = await jiti.import(configPath);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new RippleError(
      `Could not load ${path.basename(configPath)}: ${detail}`,
      ExitCode.InvalidConfig,
    );
  }
  const value = (loaded as { default?: unknown })?.default ?? loaded;
  if (typeof value === "function") {
    throw new RippleError(
      `${path.basename(configPath)} must export a plain object, not a function.`,
      ExitCode.InvalidConfig,
    );
  }
  return value;
}

function validateConfig(value: unknown): RippleConfig {
  const result = rippleConfigSchema.safeParse(value);
  if (!result.success) {
    const issues = formatSchemaIssues(result.error);
    throw new RippleError(
      `Invalid config:\n${issues.map((issue) => `  ${issue}`).join("\n")}`,
      ExitCode.InvalidConfig,
    );
  }
  return result.data;
}

/**
 * Load and validate the ripple config. Never throws for a *missing* config —
 * defaults apply. Throws `RippleError` for an explicit-but-missing path or an
 * invalid config file.
 */
export async function loadConfig(cwd: string, explicitPath?: string): Promise<LoadConfigResult> {
  const configPath = findConfigFile(cwd, explicitPath);

  if (explicitPath && !configPath) {
    throw new RippleError(
      `Config file not found: ${explicitPath}`,
      ExitCode.InvalidConfig,
      "Pass a path that exists, or remove --config to use defaults.",
    );
  }

  if (!configPath) {
    return { config: rippleConfigSchema.parse({}), rootDir: path.resolve(cwd) };
  }

  const raw = await importConfig(configPath);
  const config = validateConfig(raw);
  return { config, configPath, rootDir: path.dirname(configPath) };
}

/**
 * Assemble the full `ProjectContext`: config + tsconfig facts + merged alias
 * map. The alias map is baked into the context so downstream layers never
 * touch config shapes again.
 */
export async function loadProjectContext(
  cwd: string,
  explicitConfigPath?: string,
): Promise<ProjectContext> {
  const loaded = await loadConfig(cwd, explicitConfigPath);
  const { config, rootDir } = loaded;

  const tsconfigPath = path.resolve(rootDir, config.tsconfigPath);
  const tsconfig = readTsconfig(tsconfigPath);

  const aliases: AliasMap = buildAliasMap(config.aliases, tsconfig, rootDir);

  return {
    rootDir,
    config,
    ...(tsconfig ? { tsconfig } : {}),
    aliases,
  };
}
