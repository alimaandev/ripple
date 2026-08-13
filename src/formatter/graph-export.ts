import type { Cycle } from "../types/graph.js";
import { displayPath } from "../utils/paths.js";

/**
 * Graph export formats: Mermaid (`--format mermaid`), Graphviz DOT
 * (`--format dot`) and a self-contained HTML report (`--format html`).
 *
 * All output is deterministic: nodes and edges are always emitted in sorted
 * order, and no rendering library is required at runtime.
 */

export interface GraphExportInput {
  /** Absolute file path per graph key. */
  nodes: Map<string, string>;
  /** Directed edges: source key -> target keys. */
  edges: Map<string, Set<string>>;
  cycles: Cycle[];
  cwd: string;
}

const escapeDot = (value: string): string => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const escapeMermaid = (value: string): string =>
  value.replace(/#/g, "#35;").replace(/"/g, "#quot;");

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Node keys sorted by their display path (deterministic iteration order). */
function sortedKeys(input: GraphExportInput): string[] {
  return [...input.nodes.keys()].sort((a, b) => {
    const left = input.nodes.get(a) ?? a;
    const right = input.nodes.get(b) ?? b;
    return left.localeCompare(right);
  });
}

const nodeLabel = (input: GraphExportInput, key: string): string =>
  displayPath(input.nodes.get(key) ?? key, input.cwd);

/** Cycle members that exist in the exported node set, sorted by path. */
function cycleMembers(input: GraphExportInput): string[] {
  const present = new Set<string>();
  for (const cycle of input.cycles) {
    for (const member of cycle.members) {
      if (input.nodes.has(member)) present.add(member);
    }
  }
  return [...present].sort((a, b) => nodeLabel(input, a).localeCompare(nodeLabel(input, b)));
}

/** Sorted edge key pairs that stay inside the node set (sorted by labels). */
function internalEdges(input: GraphExportInput): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (const [source, targets] of input.edges) {
    if (!input.nodes.has(source)) continue;
    for (const target of targets) {
      if (!input.nodes.has(target)) continue;
      pairs.push([source, target]);
    }
  }
  return pairs.sort((a, b) => {
    const left = nodeLabel(input, a[0]).localeCompare(nodeLabel(input, b[0]));
    return left !== 0 ? left : nodeLabel(input, a[1]).localeCompare(nodeLabel(input, b[1]));
  });
}

/** Render the graph as a Mermaid flowchart. */
export function renderMermaidGraph(input: GraphExportInput): string {
  const keys = sortedKeys(input);
  const idByKey = new Map<string, string>(keys.map((key, index) => [key, `n${index}`]));

  const lines: string[] = ["flowchart LR"];
  lines.push("  classDef cycle fill:#4a2525,stroke:#f85149,color:#f0b3b3;");
  for (const key of keys) {
    lines.push(`  ${idByKey.get(key)}["${escapeMermaid(nodeLabel(input, key))}"]`);
  }
  for (const [source, target] of internalEdges(input)) {
    lines.push(`  ${idByKey.get(source)} --> ${idByKey.get(target)}`);
  }

  const members = cycleMembers(input)
    .map((key) => idByKey.get(key))
    .filter((id): id is string => id !== undefined);
  if (members.length > 0) {
    lines.push(`  class ${members.join(",")} cycle;`);
  }

  return `${lines.join("\n")}\n`;
}

/** Render the graph as Graphviz DOT. */
export function renderDotGraph(input: GraphExportInput): string {
  const lines: string[] = [
    "digraph ripple {",
    "  rankdir=LR;",
    '  node [shape=box, style="rounded,filled", fillcolor="#161b22", color="#30363d", fontcolor="#e6edf3"];',
    '  edge [color="#8b949e"];',
  ];
  for (const key of sortedKeys(input)) {
    const label = nodeLabel(input, key);
    lines.push(`  "${escapeDot(label)}" [label="${escapeDot(label)}"];`);
  }
  for (const [source, target] of internalEdges(input)) {
    lines.push(
      `  "${escapeDot(nodeLabel(input, source))}" -> "${escapeDot(nodeLabel(input, target))}";`,
    );
  }
  for (const key of cycleMembers(input)) {
    const label = nodeLabel(input, key);
    lines.push(`  "${escapeDot(label)}" [color="#f85149", penwidth=1.5];`);
  }
  lines.push("}");
  return `${lines.join("\n")}\n`;
}

/** Render the graph as a self-contained HTML report. */
export function renderHtmlGraph(input: GraphExportInput): string {
  const keys = sortedKeys(input);
  const edges = internalEdges(input);
  const members = cycleMembers(input);

  const cycleLines = input.cycles
    .map((cycle) =>
      cycle.path
        .filter((key) => input.nodes.has(key))
        .map((key) => escapeHtml(nodeLabel(input, key)))
        .join(" &#8594; "),
    )
    .filter((line) => line.length > 0);

  const edgeRows = edges
    .map(
      ([source, target]) =>
        `      <tr><td>${escapeHtml(nodeLabel(input, source))}</td><td>&#8594;</td><td>${escapeHtml(nodeLabel(input, target))}</td></tr>`,
    )
    .join("\n");

  const cycleRows =
    cycleLines.length > 0
      ? cycleLines.map((line) => `      <li><code>${line}</code></li>`).join("\n")
      : "      <li><em>none</em></li>";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ripple — dependency graph</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; padding: 2rem; background: #0d1117; color: #e6edf3;
         font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  h1 { font-size: 1.4rem; margin: 0 0 .25rem; }
  h2 { font-size: 1.05rem; margin: 2rem 0 .5rem; color: #79c0ff; }
  code, pre { font-family: SFMono-Regular, Consolas, monospace; }
  pre { background: #161b22; border: 1px solid #30363d; border-radius: 8px;
        padding: 1rem; overflow-x: auto; font-size: .85rem; }
  table { border-collapse: collapse; width: 100%; font-size: .9rem; }
  th, td { text-align: left; padding: .35rem .6rem; border-bottom: 1px solid #21262d; }
  th { color: #8b949e; font-weight: 600; }
  .stats { display: flex; gap: 1.5rem; margin-top: 1rem; }
  .stat b { display: block; font-size: 1.6rem; color: #79c0ff; }
  .stat span { color: #8b949e; font-size: .8rem; }
  .muted { color: #8b949e; }
  a { color: #79c0ff; }
</style>
</head>
<body>
  <h1>Ripple dependency graph</h1>
  <p class="muted">Exported with <code>ripple graph --format html</code> — deterministic and offline.</p>
  <div class="stats">
    <div class="stat"><b>${keys.length}</b><span>files</span></div>
    <div class="stat"><b>${edges.length}</b><span>edges</span></div>
    <div class="stat"><b>${input.cycles.length}</b><span>cycle groups</span></div>
  </div>

  <h2>Circular dependencies</h2>
  <ul>${cycleRows}</ul>
  <p class="muted">Cycle members: ${members.map(escapeHtml).join(", ")}</p>

  <h2>Graph</h2>
  <pre><code class="language-mermaid">${escapeHtml(renderMermaidGraph(input)).trimEnd()}</code></pre>
  <p class="muted">Render this diagram with the
    <a href="https://mermaid.live">Mermaid live editor</a> or a tool that
    understands Mermaid (GitHub markdown, docs sites, IDEs).</p>

  <h2>Edges (${edges.length})</h2>
  <table>
    <thead><tr><th>Source</th><th></th><th>Target</th></tr></thead>
    <tbody>
${edgeRows}
    </tbody>
  </table>
</body>
</html>
`;
}
