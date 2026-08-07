import path from "node:path";
import chalk from "chalk";
import { loadConfig, loadProjectContext } from "../config/loader.js";
import { buildGraph } from "../graph/build.js";
import { createTsProject } from "../parser/ts-project.js";
import { discoverSourceFiles } from "../scanner/discover.js";
import { createSpinner } from "../cli/spinner.js";
import { resolveColor } from "../ui/color.js";
import { brandHeader } from "../ui/brand.js";
import { icon } from "../ui/icons.js";
import { dim, type TextStyle } from "../formatter/text.js";
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
  const color = resolveColor(options.color);
  const style: TextStyle = { color };
  const spinner = createSpinner(color);
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
      renderResults(results, ctx, color);
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

  renderResults(results, ctx, color);
  const failed = results.some((check) => check.state === "fail");
  const warned = results.some((check) => check.state === "warn");
  const verdict = failed
    ? { icon: icon("cross"), text: "Diagnoses found problems.", color: chalk.red }
    : warned
      ? { icon: icon("warning"), text: "Diagnoses passed with warnings.", color: chalk.yellow }
      : { icon: icon("tick"), text: "All checks passed.", color: chalk.green };
  const verdictIcon = style.color ? verdict.color(verdict.icon) : verdict.icon;
  ctx.writer.writeLine(`${verdictIcon} ${verdict.text}`);
  return failed ? ExitCode.Failure : ExitCode.Success;
}

function renderResults(results: CheckResult[], ctx: CommandContext, color: boolean): void {
  const style: TextStyle = { color };
  ctx.writer.writeLine(brandHeader({ label: "project health check", version: ctx.version, style }));
  ctx.writer.writeLine();

  const width = Math.max(...results.map((check) => check.label.length));
  for (const check of results) {
    const stateIcon =
      check.state === "ok"
        ? icon("tick")
        : check.state === "warn"
          ? icon("warning")
          : icon("cross");
    const colored =
      check.state === "ok" ? chalk.green : check.state === "warn" ? chalk.yellow : chalk.red;
    const mark = style.color ? colored(stateIcon) : stateIcon;
    const detail = check.detail ? ` ${dim(check.detail, style)}` : "";
    ctx.writer.writeLine(`${mark} ${check.label.padEnd(width)}${detail}`);
  }
  ctx.writer.writeLine();
}
