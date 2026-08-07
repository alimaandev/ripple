/**
 * User-facing configuration for Ripple, validated by `src/config/schema.ts`.
 *
 * Every field has a default; a user config only overrides what it sets.
 */
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
 * The validated `ripple.config.ts` shape.
 */
export interface RippleConfig {
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
}

/**
 * Normalized alias map used by the resolver: pattern → absolute target.
 * Both sides support a single `*` wildcard (`"@/*"` → `"C:/proj/src/*"`).
 */
export type AliasMap = Record<string, string>;
