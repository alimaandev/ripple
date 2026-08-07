import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_CONFIG } from "../config/defaults.js";
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
  const target = path.join(ctx.cwd, INIT_FILENAME);

  try {
    await fs.access(target);
    if (!options.force) {
      ctx.writer.writeLine(`✖ ${INIT_FILENAME} already exists. Pass --force to overwrite it.`);
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
    ctx.writer.writeLine(`✓ Wrote ${INIT_FILENAME}`);
    ctx.writer.writeLine(`  Edit it to tune include globs, aliases and risk weights.`);
    return ExitCode.Success;
  } catch (error) {
    ctx.writer.writeLine(
      `✖ Could not write ${INIT_FILENAME}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return ExitCode.Failure;
  }
}
