import { Command, CommanderError } from "commander";
import { analyzeCommand } from "../commands/analyze.js";
import { graphCommand } from "../commands/graph.js";
import { doctorCommand } from "../commands/doctor.js";
import { initCommand } from "../commands/init.js";
import { diffCommand } from "../commands/diff.js";
import { RippleError } from "../utils/errors.js";
import { ExitCode } from "../types/cli.js";
import type { CommandContext, ExitCode as ExitCodeType } from "../types/cli.js";

/**
 * CLI program definition. `run()` returns the process exit code instead of
 * calling `process.exit`, which keeps the CLI integration-testable.
 */

const PROGRAM_NAME = "ripple";

export function createProgram(ctx: CommandContext): Command {
  const program = new Command()
    .name(PROGRAM_NAME)
    .description("Dependency impact analysis for TypeScript and JavaScript projects.")
    .version(ctx.version, "-V, --version", "print the Ripple version")
    .showHelpAfterError();

  program
    .command("analyze <file>")
    .description("Analyze the impact of changing a file")
    .option("-j, --json", "emit a machine-readable JSON report")
    .option("-v, --verbose", "include the risk factor breakdown")
    .option("-d, --depth <number>", "cap the reverse traversal depth", parsePositiveInt)
    .option("-c, --config <path>", "path to a ripple config file")
    .option("--no-color", "disable ANSI colors")
    .action(async (file: string, options: Record<string, unknown>) => {
      const exitCode = await analyzeCommand(
        file,
        {
          json: Boolean(options.json),
          verbose: Boolean(options.verbose),
          ...(options.depth !== undefined ? { depth: options.depth as number } : {}),
          ...(options.config !== undefined ? { config: options.config as string } : {}),
          color: options.color as boolean | undefined,
        },
        ctx,
      );
      if (exitCode !== ExitCode.Success) {
        throw new ExitError(exitCode);
      }
    });

  program
    .command("graph [file]")
    .description("Show project graph stats, or the dependency tree of one file")
    .option("-j, --json", "emit a machine-readable JSON report")
    .option("-v, --verbose", "include extra sections")
    .option("-r, --reverse", "show dependents (what imports the file) instead of dependants")
    .option("-d, --depth <number>", "cap the tree depth", parsePositiveInt)
    .option("-c, --config <path>", "path to a ripple config file")
    .option("--no-color", "disable ANSI colors")
    .action(async (file: string | undefined, options: Record<string, unknown>) => {
      const exitCode = await graphCommand(
        file,
        {
          json: Boolean(options.json),
          verbose: Boolean(options.verbose),
          reverse: Boolean(options.reverse),
          ...(options.depth !== undefined ? { depth: options.depth as number } : {}),
          ...(options.config !== undefined ? { config: options.config as string } : {}),
          color: options.color as boolean | undefined,
        },
        ctx,
      );
      if (exitCode !== ExitCode.Success) {
        throw new ExitError(exitCode);
      }
    });

  program
    .command("diff")
    .description("Analyze changed files since a base ref and gate risky changes")
    .option("-j, --json", "emit a machine-readable JSON report")
    .option("-v, --verbose", "include extra sections")
    .option("-b, --base <ref>", "git ref to diff against (default: origin/main, main, HEAD~1)")
    .option(
      "-g, --gate <level>",
      "risk level that blocks the gate (medium | high | critical)",
      parseGateLevel,
    )
    .option("-d, --depth <number>", "cap the reverse traversal depth", parsePositiveInt)
    .option("-c, --config <path>", "path to a ripple config file")
    .option("--no-color", "disable ANSI colors")
    .action(async (options: Record<string, unknown>) => {
      const exitCode = await diffCommand(
        {
          json: Boolean(options.json),
          verbose: Boolean(options.verbose),
          ...(options.base !== undefined ? { base: options.base as string } : {}),
          ...(options.gate !== undefined
            ? { gate: options.gate as "medium" | "high" | "critical" }
            : {}),
          ...(options.depth !== undefined ? { depth: options.depth as number } : {}),
          ...(options.config !== undefined ? { config: options.config as string } : {}),
          color: options.color as boolean | undefined,
        },
        ctx,
      );
      if (exitCode !== ExitCode.Success) {
        throw new ExitError(exitCode);
      }
    });

  program
    .command("doctor")
    .description("Check the project and environment for Ripple readiness")
    .option("-v, --verbose", "print detailed diagnostics")
    .option("-c, --config <path>", "path to a ripple config file")
    .option("--no-color", "disable ANSI colors")
    .action(async (options: Record<string, unknown>) => {
      const exitCode = await doctorCommand(
        {
          verbose: Boolean(options.verbose),
          config: options.config as string | undefined,
          color: options.color as boolean | undefined,
        },
        ctx,
      );
      if (exitCode !== ExitCode.Success) {
        throw new ExitError(exitCode);
      }
    });

  program
    .command("init")
    .description("Create a ripple.config.json with the default settings")
    .option("-f, --force", "overwrite an existing config file")
    .option("--no-color", "disable ANSI colors")
    .action(async (options: Record<string, unknown>) => {
      const exitCode = await initCommand(
        { force: Boolean(options.force), color: options.color as boolean | undefined },
        ctx,
      );
      if (exitCode !== ExitCode.Success) {
        throw new ExitError(exitCode);
      }
    });

  program
    .command("version")
    .description("Print the Ripple version")
    .action(() => {
      ctx.writer.writeLine(ctx.version);
    });

  program.addHelpText(
    "beforeAll",
    `ripple — dependency impact analysis for TypeScript and JavaScript\n`,
  );

  return program;
}

/** Thrown internally to propagate a non-success exit code through commander. */
class ExitError extends Error {
  constructor(readonly exitCode: ExitCodeType) {
    super(`exit ${exitCode}`);
    this.name = "ExitError";
  }
}

function parsePositiveInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new CommanderError(
      1,
      "commander.invalidArgument",
      `expected a positive integer, got "${value}"`,
    );
  }
  return parsed;
}

/** Validate the `--gate` argument. */
function parseGateLevel(value: string): "medium" | "high" | "critical" {
  if (value === "medium" || value === "high" || value === "critical") {
    return value;
  }
  throw new CommanderError(
    1,
    "commander.invalidArgument",
    `expected one of medium | high | critical, got "${value}"`,
  );
}

/** Print an error to the error stream. */
function printError(error: unknown, ctx: CommandContext): void {
  if (error instanceof RippleError) {
    ctx.errorWriter.writeLine(`✖ ${error.message}`);
    if (error.hint) ctx.errorWriter.writeLine(`  ${error.hint}`);
    return;
  }
  if (error instanceof Error) {
    ctx.errorWriter.writeLine(`✖ ${error.message}`);
    return;
  }
  ctx.errorWriter.writeLine(`✖ ${String(error)}`);
}

export interface RunOptions {
  argv: string[];
  ctx: CommandContext;
}

/** Parse arguments and run the CLI, returning the exit code. */
export async function run({ argv, ctx }: RunOptions): Promise<ExitCodeType> {
  const program = createProgram(ctx);
  program.exitOverride();

  try {
    await program.parseAsync(argv);
    return ExitCode.Success;
  } catch (error) {
    if (error instanceof ExitError) {
      return error.exitCode;
    }
    if (error instanceof CommanderError) {
      if (error.exitCode === 0) return ExitCode.Success;
      return ExitCode.Failure;
    }
    printError(error, ctx);
    return error instanceof RippleError ? error.exitCode : ExitCode.Failure;
  }
}
