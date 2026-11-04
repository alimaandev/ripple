import { createInterface } from "node:readline";
import { loadProjectContext } from "../config/loader.js";
import { runPipeline } from "./pipeline.js";
import { changedFiles } from "../git/changed.js";
import { McpServer } from "../mcp/server.js";
import { createMcpTools, type ProjectSnapshot } from "../mcp/tools.js";
import { ExitCode } from "../types/cli.js";
import type { CommandContext } from "../types/cli.js";

/**
 * `ripple mcp`
 *
 * Exposes Ripple's analysis as Model Context Protocol tools over stdio, so
 * AI coding agents can check a file's blast radius, list its dependents,
 * score the risk of touching it, and verify the merge gate before
 * refactoring.
 *
 * stdio is a strict contract here: the server speaks one JSON-RPC message
 * per line on stdout and nothing else. All human-readable output goes to
 * stderr.
 */

export interface McpOptions {
  config?: string;
}

export async function mcpCommand(options: McpOptions, ctx: CommandContext): Promise<ExitCode> {
  /**
   * Rebuild the project on every tool call. A long-lived MCP session is
   * exactly the workflow that edits files between calls, so a memoized graph
   * would answer from stale source. The incremental parse cache keeps the
   * rebuild cheap: unchanged files are stat + cache hits, not re-parses.
   */
  const loadProject = async (): Promise<ProjectSnapshot> => {
    const context = await loadProjectContext(ctx.cwd, options.config);
    const { graph, entryPoints } = await runPipeline(context);
    return { context, graph, entryPoints };
  };

  const server = new McpServer({
    name: "ripple",
    version: ctx.version,
    tools: createMcpTools({
      cwd: ctx.cwd,
      loadProject,
      getChanged: (base) => changedFiles(ctx.cwd, base),
    }),
  });

  const stdin = createInterface({ input: process.stdin, crlfDelay: Infinity });
  await new Promise<void>((resolve) => {
    stdin.on("line", (line) => {
      if (!line.trim()) return;
      void server.handleLine(line).then((response) => {
        if (response) process.stdout.write(response);
      });
    });
    stdin.on("close", () => resolve());
  });

  return ExitCode.Success;
}
