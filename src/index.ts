/**
 * Public API surface for `@alimaandev/ripple`.
 *
 * The CLI is the primary interface, but config authors can import the types
 * and schema here to write fully-typed `ripple.config.ts` files:
 *
 *   import type { RippleConfig } from "@alimaandev/ripple";
 */

export type { DiffConfig, RippleConfig, AliasMap } from "./types/config.js";
export type { ProjectContext, TsconfigInfo } from "./types/project.js";
export type { RiskLevel, RiskFactor, RiskResult } from "./types/risk.js";
export { rippleConfigSchema, formatSchemaIssues } from "./config/schema.js";
