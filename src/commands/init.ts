import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { resolveColor } from "../ui/color.js";
import { icon } from "../ui/icons.js";
import { dim } from "../formatter/text.js";
import { ExitCode } from "../types/cli.js";
import type { CommandContext, InitOptions } from "../types/cli.js";

/**
 * `ripple init`
 *
 * Writes a config file next to the current directory. Defaults to a minimal
 * `ripple.config.json` that references the published JSON Schema for editor
 * autocomplete. `--full` dumps every built-in default; `--ts` writes a typed
 * `ripple.config.ts`. Refuses to overwrite an existing file unless `--force`.
 */

const SCHEMA_REF = "./node_modules/@alimaandev/ripple/ripple.schema.json";

function jsonPayload(full: boolean): Record<string, unknown> {
  const payload = full ? { ...DEFAULT_CONFIG } : { include: DEFAULT_CONFIG.include };
  return { ...payload, $schema: SCHEMA_REF };
}

/** Render a plain value as a TypeScript object/array literal. */
function tsValue(value: unknown, indent: string): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((item) => tsValue(item, `${indent}  `)).join(`,\n${indent}  `);
    return `[\n${indent}  ${items}\n${indent}]`;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, entry]) => entry !== undefined,
    );
    if (entries.length === 0) return "{}";
    const items = entries
      .map(([key, entry]) => `${key}: ${tsValue(entry, `${indent}  `)}`)
      .join(`,\n${indent}  `);
    return `{\n${indent}  ${items}\n${indent}}`;
  }
  return JSON.stringify(value);
}

function tsPayload(full: boolean): string {
  if (!full) {
    return `import type { RippleConfig } from "@alimaandev/ripple";

const config: RippleConfig = {
  include: ${JSON.stringify(DEFAULT_CONFIG.include)},
};

export default config;
`;
  }
  const body = tsValue({ ...DEFAULT_CONFIG }, "  ");
  return `import type { RippleConfig } from "@alimaandev/ripple";

const config: RippleConfig = ${body};

export default config;
`;
}

export async function initCommand(options: InitOptions, ctx: CommandContext): Promise<ExitCode> {
  const style = { color: resolveColor(options.color) };
  const fileName = options.ts ? "ripple.config.ts" : "ripple.config.json";
  const target = path.join(ctx.cwd, fileName);

  try {
    await fs.access(target);
    if (!options.force) {
      const mark = style.color ? chalk.red(icon("cross")) : icon("cross");
      ctx.writer.writeLine(`${mark} ${fileName} already exists. Pass --force to overwrite it.`);
      return ExitCode.Failure;
    }
  } catch {
    /* file does not exist — safe to create */
  }

  const content = options.ts
    ? tsPayload(Boolean(options.full))
    : `${JSON.stringify(jsonPayload(Boolean(options.full)), null, 2)}\n`;

  try {
    await fs.writeFile(target, content, "utf8");
    const mark = style.color ? chalk.green(icon("tick")) : icon("tick");
    ctx.writer.writeLine(`${mark} Wrote ${fileName}`);
    ctx.writer.writeLine(
      `  ${dim("Edit it to tune include globs, aliases and risk weights.", style)}`,
    );
    return ExitCode.Success;
  } catch (error) {
    const mark = style.color ? chalk.red(icon("cross")) : icon("cross");
    ctx.writer.writeLine(
      `${mark} Could not write ${fileName}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return ExitCode.Failure;
  }
}
