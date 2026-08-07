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
 * Writes a `ripple.config.json` with the built-in defaults next to the
 * current directory. Refuses to overwrite an existing file unless `--force`.
 */

const INIT_FILENAME = "ripple.config.json";

export async function initCommand(options: InitOptions, ctx: CommandContext): Promise<ExitCode> {
  const style = { color: resolveColor(options.color) };
  const target = path.join(ctx.cwd, INIT_FILENAME);

  try {
    await fs.access(target);
    if (!options.force) {
      const mark = style.color ? chalk.red(icon("cross")) : icon("cross");
      ctx.writer.writeLine(
        `${mark} ${INIT_FILENAME} already exists. Pass --force to overwrite it.`,
      );
      return ExitCode.Failure;
    }
  } catch {
    /* file does not exist — safe to create */
  }

  const payload = {
    ...DEFAULT_CONFIG,
  };

  try {
    await fs.writeFile(target, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    const mark = style.color ? chalk.green(icon("tick")) : icon("tick");
    ctx.writer.writeLine(`${mark} Wrote ${INIT_FILENAME}`);
    ctx.writer.writeLine(
      `  ${dim("Edit it to tune include globs, aliases and risk weights.", style)}`,
    );
    return ExitCode.Success;
  } catch (error) {
    const mark = style.color ? chalk.red(icon("cross")) : icon("cross");
    ctx.writer.writeLine(
      `${mark} Could not write ${INIT_FILENAME}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return ExitCode.Failure;
  }
}
