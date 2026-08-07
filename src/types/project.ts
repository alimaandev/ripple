import type { AliasMap, RippleConfig } from "./config.js";

/**
 * tsconfig.json facts Ripple consumes. Loaded via `src/utils/tsconfig.ts`.
 */
export interface TsconfigInfo {
  /** Absolute path of the tsconfig file. */
  path: string;
  /** Directory containing the tsconfig (the resolution base for aliases). */
  dir: string;
  /** Absolute `baseUrl`, if configured. */
  baseUrl?: string;
  /** `paths` mappings: pattern → replacement patterns. */
  paths: Record<string, string[]>;
  include: string[];
  exclude: string[];
}

/**
 * Everything the analysis pipeline needs to know about the project it runs
 * in. Built once by `src/config/loader.ts` and passed down explicitly.
 */
export interface ProjectContext {
  /** Absolute project root (config file location or cwd). */
  rootDir: string;
  /** Validated user config. */
  config: RippleConfig;
  /** tsconfig facts, when a tsconfig was found. */
  tsconfig?: TsconfigInfo;
  /** Normalized alias map (user aliases + tsconfig paths). */
  aliases: AliasMap;
}

/** Result of config loading, before the project context is assembled. */
export interface LoadConfigResult {
  config: RippleConfig;
  /** Absolute path of the config file, when one was found. */
  configPath?: string;
  rootDir: string;
}
