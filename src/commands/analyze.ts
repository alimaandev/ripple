import { loadProjectContext } from "../config/loader.js";
import { analyzeFile } from "../analyzer/analyze.js";
import { createStageTracker } from "../ui/progress.js";
import { resolveColor } from "../ui/color.js";
import { buildAnalyzeJsonReport, renderAnalyzeReport } from "../output/report.js";
import { serializeJson } from "../formatter/json.js";
import { requireNode, resolveTargetFile, runPipeline } from "./pipeline.js";
import { RippleError } from "../utils/errors.js";
import { pathExists } from "../utils/fs.js";
import { ExitCode } from "../types/cli.js";
import type { AnalyzeOptions, CommandContext } from "../types/cli.js";

/**
 * `ripple analyze <file>`
 *
 * Full impact analysis of one file: reverse traversal, risk score, and a
 * terminal or JSON report.
 */
export async function analyzeCommand(
  fileArg: string,
  options: AnalyzeOptions,
  ctx: CommandContext,
): Promise<ExitCode> {
  const targetPath = resolveTargetFile(fileArg, ctx.cwd);
  if (!(await pathExists(targetPath))) {
    throw new RippleError(`File not found: ${fileArg}`, ExitCode.NotFound);
  }

  const tracker = createStageTracker(!options.json);
  tracker.next("Loading config");

  const started = Date.now();
  const context = await loadProjectContext(ctx.cwd, options.config);

  tracker.next("Building dependency graph");
  const { graph, entryPoints, durationMs: pipelineMs } = await runPipeline(context);

  tracker.next("Analyzing impact");
  const completed = Date.now();
  const result = analyzeFile({
    graph,
    context,
    entryPoints,
    targetKey: requireNode(graph, targetPath, context.rootDir).key,
    targetPath,
    durationMs: pipelineMs + (completed - started),
    ...(options.depth !== undefined ? { maxDepth: options.depth } : {}),
  });
  tracker.done();

  if (options.json) {
    const report = buildAnalyzeJsonReport(result, ctx.version, ctx.cwd);
    ctx.writer.write(serializeJson(report));
    return ExitCode.Success;
  }

  renderAnalyzeReport(
    result,
    {
      cwd: ctx.cwd,
      color: resolveColor(options.color),
      verbose: options.verbose,
      version: ctx.version,
    },
    ctx.writer,
  );
  return ExitCode.Success;
}
