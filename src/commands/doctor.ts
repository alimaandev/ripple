import path from "node:path";
import { loadConfig, loadProjectContext } from "../config/loader.js";
import { buildGraph } from "../graph/build.js";
import { createTsProject } from "../parser/ts-project.js";
import { discoverSourceFiles } from "../scanner/discover.js";
import { createSpinner } from "../cli/spinner.js";
import { pathKey } from "../utils/paths.js";
import { findPackageJson } from "../utils/fs.js";
import { ExitCode } from "../types/cli.js";
import type { CommandContext, DoctorOptions } from "../types/cli.js";

/**
 * `ripple doctor`
 *
 * Environment and project health check. Each check is independent; a failed
 * check is reported but does not abort the run. Exits non-zero when any
 * check fails.
 */

interface CheckResult {
  label: string;
  state: "ok" | "warn" | "fail";
  detail?: string;
}

export async function doctorCommand(
  options: DoctorOptions,
  ctx: CommandContext,
): Promise<ExitCode> {
  const spinner = createSpinner(options.color !== false);
  spinner.start("Running diagnostics…");
  const results: CheckResult[] = [];
  const check = (label: string, state: "ok" | "warn" | "fail", detail?: string): void => {
    results.push({ label, state, detail });
  };

  try {
    check("Node.js runtime", "ok", process.version);

    const packageJson = await findPackageJson(ctx.cwd);
    if (packageJson) {
      check("package.json", "ok", path.relative(ctx.cwd, packageJson));
    } else {
      check("package.json", "fail", "not found in this directory or its parents");
    }

    let context;
    try {
      const loaded = await loadConfig(ctx.cwd, options.config);
      check(
        "ripple config",
        "ok",
        loaded.configPath ? path.relative(ctx.cwd, loaded.configPath) : "defaults",
      );
      context = await loadProjectContext(ctx.cwd, options.config);
    } catch (error) {
      check("ripple config", "fail", error instanceof Error ? error.message : String(error));
      renderResults(results, ctx);
      return ExitCode.InvalidConfig;
    }

    if (context.tsconfig) {
      check("tsconfig.json", "ok", path.relative(ctx.cwd, context.tsconfig.path));
    } else {
      check("tsconfig.json", "warn", "not found — path aliases unavailable");
    }

    const project = createTsProject();
    const filePaths = await discoverSourceFiles({
      rootDir: context.rootDir,
      include: context.config.include,
      ignore: context.config.ignore,
    });
    if (filePaths.length > 0) {
      check("source files", "ok", `${filePaths.length} discovered`);
    } else {
      check("source files", "fail", "no source files matched the include globs");
    }

    if (Object.keys(context.aliases).length > 0) {
      check("path aliases", "ok", `${Object.keys(context.aliases).length} configured`);
    }

    const graph = buildGraph(project, filePaths, {
      rootDir: context.rootDir,
      aliases: context.aliases,
      fileKeys: new Set(filePaths.map((p) => pathKey(p, context.rootDir))),
    });

    const { stats } = graph;
    const parseRate = stats.files === 0 ? 1 : stats.parsed / stats.files;
    if (parseRate >= 0.99) {
      check("parse", "ok", "all files parsed cleanly");
    } else if (parseRate >= 0.9) {
      check("parse", "warn", `${stats.files - stats.parsed} file(s) failed to parse`);
    } else {
      check("parse", "fail", `${stats.files - stats.parsed} file(s) failed to parse`);
    }

    if (stats.unresolvedEdges === 0) {
      check("import resolution", "ok", "all internal imports resolved");
    } else {
      check("import resolution", "warn", `${stats.unresolvedEdges} unresolved import(s)`);
    }

    if (stats.cycles === 0) {
      check("circular dependencies", "ok", "none found");
    } else {
      check("circular dependencies", "warn", `${stats.cycles} cycle group(s)`);
    }
  } finally {
    spinner.stop();
  }

  renderResults(results, ctx);
  const failed = results.some((check) => check.state === "fail");
  const warned = results.some((check) => check.state === "warn");
  ctx.writer.writeLine(
    failed
      ? "✖ Diagnoses found problems."
      : warned
        ? "⚠ Diagnoses passed with warnings."
        : "✓ All checks passed.",
  );
  return failed ? ExitCode.Failure : ExitCode.Success;
}

function renderResults(results: CheckResult[], ctx: CommandContext): void {
  for (const check of results) {
    const icon = check.state === "ok" ? "✓" : check.state === "warn" ? "⚠" : "✖";
    const suffix = check.detail ? ` ${check.detail}` : "";
    ctx.writer.writeLine(`${icon} ${check.label}${suffix}`);
  }
  ctx.writer.writeLine();
}
