import { z } from "zod";
import type { RippleConfig } from "../types/config.js";
import { DEFAULT_CONFIG } from "./defaults.js";

/**
 * Zod schema for `ripple.config.ts`. Every field has a default, so parsing a
 * partial user config yields a complete validated `RippleConfig`.
 *
 * Note: outer objects default to their *full* default object. `.default({})`
 * would skip inner field defaults, since zod uses the default value as-is
 * without re-parsing it.
 */

const fraction = z.number().min(0).max(1);
const score = z.number().min(0).max(100);

const riskWeightsSchema = z
  .object({
    affectedFiles: fraction.default(DEFAULT_CONFIG.risk.weights.affectedFiles),
    entryPoint: fraction.default(DEFAULT_CONFIG.risk.weights.entryPoint),
    sharedUtility: fraction.default(DEFAULT_CONFIG.risk.weights.sharedUtility),
    publicExports: fraction.default(DEFAULT_CONFIG.risk.weights.publicExports),
    tests: fraction.default(DEFAULT_CONFIG.risk.weights.tests),
    routes: fraction.default(DEFAULT_CONFIG.risk.weights.routes),
    cycleMembership: fraction.default(DEFAULT_CONFIG.risk.weights.cycleMembership),
  })
  .strict();

const riskThresholdsSchema = z
  .object({
    medium: score.default(DEFAULT_CONFIG.risk.thresholds.medium),
    high: score.default(DEFAULT_CONFIG.risk.thresholds.high),
    critical: score.default(DEFAULT_CONFIG.risk.thresholds.critical),
  })
  .strict();

const riskConfigSchema = z
  .object({
    weights: riskWeightsSchema.default(DEFAULT_CONFIG.risk.weights),
    thresholds: riskThresholdsSchema.default(DEFAULT_CONFIG.risk.thresholds),
  })
  .strict();

const diffConfigSchema = z
  .object({
    base: z.string().min(1).optional(),
    gate: z.enum(["medium", "high", "critical"]).default(DEFAULT_CONFIG.diff.gate),
  })
  .strict();

export const rippleConfigSchema: z.ZodType<RippleConfig> = z
  .object({
    include: z.array(z.string().min(1)).min(1).default(DEFAULT_CONFIG.include),
    ignore: z.array(z.string()).default(DEFAULT_CONFIG.ignore),
    aliases: z.record(z.string(), z.string()).default(DEFAULT_CONFIG.aliases),
    tsconfigPath: z.string().min(1).default(DEFAULT_CONFIG.tsconfigPath),
    risk: riskConfigSchema.default(DEFAULT_CONFIG.risk),
    diff: diffConfigSchema.default(DEFAULT_CONFIG.diff),
  })
  .strict();

/** Human-readable list of validation problems, for friendly error output. */
export function formatSchemaIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join(".");
    const location = path === "" ? "config" : `config.${path}`;
    return `${location}: ${issue.message}`;
  });
}
