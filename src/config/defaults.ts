import type { RippleConfig } from "../types/config.js";

/**
 * Built-in defaults. A user config only overrides fields it sets; anything
 * else keeps these values.
 */
export const DEFAULT_CONFIG: RippleConfig = {
  include: ["**/*.{ts,tsx,js,jsx}"],
  ignore: ["node_modules", "dist", "build", "coverage", ".next", "out", ".git"],
  aliases: {},
  tsconfigPath: "tsconfig.json",
  risk: {
    weights: {
      affectedFiles: 0.3,
      entryPoint: 0.15,
      sharedUtility: 0.15,
      publicExports: 0.1,
      tests: 0.1,
      routes: 0.1,
      cycleMembership: 0.1,
    },
    thresholds: {
      medium: 30,
      high: 55,
      critical: 80,
    },
  },
};
