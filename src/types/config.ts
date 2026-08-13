/**
 * User-facing configuration for Ripple, validated by `src/config/schema.ts`.
 *
 * Every field has a default; a user config only overrides what it sets.
 */
import type { GateLevel } from "./output.js";
export interface RiskWeights {
  /** Weight of the (log-scaled) number of affected files. */
  affectedFiles: number;
  /** Weight of whether an entry point is affected. */
  entryPoint: number;
  /** Weight of how many shared utilities are affected. */
  sharedUtility: number;
  /** Weight of the target file's public export surface. */
  publicExports: number;
  /** Weight of affected test files. */
  tests: number;
  /** Weight of affected API routes. */
  routes: number;
  /** Weight of the target file being part of a circular dependency. */
  cycleMembership: number;
}

/**
 * Score thresholds that map a 0-100 risk score to a level.
 * A score >= `critical` is CRITICAL, >= `high` is HIGH, >= `medium` is MEDIUM,
 * anything below is LOW.
 */
export interface RiskThresholds {
  medium: number;
  high: number;
  critical: number;
}

export interface RiskConfig {
  weights: RiskWeights;
  thresholds: RiskThresholds;
}

/**
 * Diff command tuning. CLI flags (`--base`, `--gate`) always take precedence
 * over these values.
 */
export interface DiffConfig {
  /** Git ref used as the change-set base when no `--base` is given. */
  base?: string;
  /** Minimum risk level that fails the diff gate. Defaults to `"high"`. */
  gate: GateLevel;
  /**
   * Glob patterns (relative to the project root) of files that are analyzed
   * and reported but never block the gate. Useful for adopting the gate on
   * legacy code without fixing every pre-existing risk on day one.
   */
  allow: string[];
}

/**
 * The validated `ripple.config.ts` shape.
 */
export interface RippleConfig {
  /**
   * JSON Schema reference used by editors for autocomplete and validation
   * (e.g. `"./node_modules/@alimaandev/ripple/ripple.schema.json"`). Ignored
   * by the CLI; written by `ripple init`.
   */
  $schema?: string;
  /** Glob patterns (relative to the project root) of source files to analyze. */
  include: string[];
  /** Glob patterns / directory names to exclude from analysis. */
  ignore: string[];
  /** Path aliases, e.g. `{ "@": "./src" }`. Merged with tsconfig `paths`. */
  aliases: Record<string, string>;
  /** Path to tsconfig.json, relative to the project root. Default: `tsconfig.json`. */
  tsconfigPath: string;
  /** Risk engine tuning. */
  risk: RiskConfig;
  /** Diff command tuning. */
  diff: DiffConfig;
}

/**
 * Normalized alias map used by the resolver: pattern → absolute target.
 * Both sides support a single `*` wildcard (`"@/*"` → `"C:/proj/src/*"`).
 */
export type AliasMap = Record<string, string>;
