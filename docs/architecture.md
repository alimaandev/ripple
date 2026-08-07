# Architecture

This document explains how Ripple is built and why. It is aimed at
contributors and at people auditing the tool's behavior.

## Overview

```
                ┌─────────────┐
                │  ripple CLI │  commander + bin entry
                └──────┬──────┘
                       │ CommandContext (writer, cwd, version)
               ┌───────┴────────┐
               │   commands/    │  analyze · graph · doctor · init
               └───────┬────────┘
                       │ runPipeline: config → discover → parse → resolve
               ┌───────┴────────┐
               │     graph/     │  nodes, forward/reverse/external edges, cycles
               └───────┬────────┘
                       │ analyzeFile
               ┌───────┴────────┐
               │   analyzer/    │  reverse traverse, categorize, impact, confidence
               │     risk/      │  weighted score → level
               └───────┬────────┘
               ┌───────┴────────┐
               │   output/      │  report assembly (terminal + JSON)
               └────────────────┘
```

Dependencies flow top-down only. `formatter/`, `utils/` and `types/` are
leaf modules used by everything else.

## The pipeline

### 1. Config (`src/config/`)

`loadProjectContext(cwd, explicitPath?)`:

1. Discovers `ripple.config.{ts,mjs,js,cjs,json}` walking up from the current
   directory. An explicit `--config` always wins.
2. Validates the file with a zod schema (`schema.ts`). The schema mirrors
   `DEFAULT_CONFIG` so every field is optional.
3. Reads `tsconfig.json` (via the TypeScript compiler API in `utils/tsconfig.ts`).
4. Merges user `aliases` with tsconfig `paths` — user entries win. Alias
   normalization produces single-wildcard patterns on both sides:
   `{ "@": "./src" }` becomes `"@/*" → "<root>/src/*"`.

The result is a `ProjectContext` — the only shape downstream layers touch.
Downstream never sees raw config again.

### 2. Discovery (`src/scanner/`)

`discoverSourceFiles` runs the configured `include` globs (fast-glob) with
`ignore` entries converted to catch-all globs, then filters to source
extensions and sorts for determinism. `node_modules` is always excluded.

### 3. Parsing (`src/parser/`)

A single ts-morph `Project` is shared across all files (one compiler host,
one cache). `parseSourceFile` extracts:

- **imports** — static `import`, side-effect imports, `export … from`,
  dynamic `import()`, `require()`, `import = require()`
- **exports** — named/default/star exports, `export const` / `export function`
  statements
- **symbols** — declarations and usage names (for future features)

Parsing never throws: a syntax error is recorded as `parseError` on the
parsed file and analysis continues. Confidence scoring accounts for it.

### 4. Graph construction (`src/graph/`)

`buildGraph` resolves every import specifier to a canonical key (POSIX,
lower-cased on Windows) and populates:

- `forward: Map<key, Set<key>>` — what each file imports
- `reverse: Map<key, Set<key>>` — what imports each file (built
  incrementally, so reverse traversals are O(n))
- `external: Map<key, Set<specifier>>` — bare package and non-source imports
- `cycles: Cycle[]` — Kosaraju strongly-connected components (iterative, so
  deep graphs cannot overflow the stack)

Resolution order for a relative specifier: alias match → exact path →
extension probing (`.ts .tsx .js .jsx .mjs .cjs .d.ts`) → `.js` → `.ts`
rewrite → directory index file. Existing non-source files (`.css`, `.json`)
produce an _external_ edge, not an unresolved one.

### 5. Analysis (`src/analyzer/`)

`analyzeFile` orchestrates:

- **`reverseTraverse`** — BFS over the reverse map with a depth cap.
  Every affected file carries its depth and cycle-membership flag.
- **`categorize`** — path/name heuristics produce categories
  (`route`, `test`, `component`, `utility`, `entry`, `other`). The entry
  set comes from `package.json` `main`/`bin` plus conventional
  root/src entry files.
- **`buildSummary`** — groups affected files by impact area (first path
  segment under the source root) and counts categories; produces `topImpact`
  and confidence.
- **`computeConfidence`** — `parseRate × (0.4 + 0.6 × resolutionRate)`,
  × 0.95 when the target is in a cycle.

### 6. Risk scoring (`src/risk/`)

Seven weighted signals (see README for the table). Each raw count is
log-scaled against a cap so one huge graph cannot dominate. The score is
mapped to a level by thresholds; factors are kept in the result so
`--verbose` can show the breakdown.

### 7. Output (`src/output/`, `src/formatter/`)

Commands render through `report.ts`, which builds either:

- a **terminal report** — text via `formatter/text.ts`, aligned key/values
  and tables via `table.ts`, trees via `tree.ts` (treeify), all pure
- a **JSON report** — plain data structures (`types/output.ts`), serialized
  by `formatter/json.ts`

`OutputWriter` abstracts the destination (`TerminalWriter` → stdout,
`InMemoryWriter` → tests). Errors go to a separate `errorWriter` (stderr).

## Error model

`RippleError` carries an exit code and an optional hint. Exit codes are
stable: 0 success, 1 failure, 2 file not found, 3 config invalid. The
commander layer (`cli/program.ts`) converts everything — including
commander's own errors — into exit codes; the process exit code is set in
`bin.ts`, keeping the program testable without `process.exit`.

## Determinism

- File discovery is sorted.
- Graph maps are keyed by canonical path keys.
- Affected lists are sorted by depth, then path.
- JSON reports are emitted with a trailing newline; no timestamps, no
  machine-dependent values except `durationMs` (and even that is
  report-only).

## Known trade-offs

- **No partial import analysis.** Ripple analyzes whole files, not
  individual exports. `change this export` is a future feature.
- **Heuristic categorization.** Routes/components/tests are detected by
  path and name conventions, not by framework config. Customize via config
  globs.
- **Single process, single pass.** The graph is built in memory; Ripple is
  designed for projects up to roughly tens of thousands of files.
