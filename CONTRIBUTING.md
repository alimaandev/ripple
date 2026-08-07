# Contributing to Ripple

Thanks for wanting to help. This file explains how the repository is
organized and how to contribute safely.

## Prerequisites

- Node.js >= 22 (tested on Node 26)
- pnpm

## Setup

```bash
pnpm install
pnpm build        # bundle the CLI into dist/
pnpm test         # unit + integration tests
pnpm lint         # eslint + prettier check
pnpm typecheck    # tsc --noEmit
```

## Repository layout

```text
src/
  cli/            commander program, bin entry, spinner
  commands/       one module per command (analyze, graph, doctor, init)
  analyzer/       reverse traversal, categorization, impact summary, confidence
  risk/           scoring model (weights, levels, thresholds)
  parser/         ts-morph-based import/export/symbol extraction
  graph/          edge resolution, graph construction, cycle detection
  scanner/        source-file discovery
  config/         zod validation, defaults, alias map, jiti loading
  formatter/      text/table/tree/json rendering (pure functions)
  output/         writers + report assembly
  types/          shared TypeScript contracts
  utils/          path, fs, glob, tsconfig helpers
tests/
  fixtures/       sample projects used by unit + integration tests
  unit/           fast tests, no process spawning
  integration/    end-to-end CLI runs against fixtures
  helpers/        fixture path helpers
```

## Conventions

- **No globals.** Every command receives a `CommandContext` (writers, cwd,
  version). Tests inject in-memory writers.
- **Pure where possible.** Rendering functions are pure; IO stays at the
  edges.
- **Never throw for a parse problem.** A broken file produces a parse error
  in the graph, never a crash.
- **Determinism.** Everything is sorted; maps are iterated in insertion
  order only where order doesn't matter.
- **No AI, no web services.** Ripple is offline and deterministic by
  design.
- Comments explain _why_, not _what_.

## Testing

Unit tests cover the pipeline layers in isolation. Integration tests spawn
the real CLI against `tests/fixtures/basic` and assert exit codes and output.
They are slower (a cold jiti + ts-morph start is a few seconds), so keep
fixture-level expectations coarse.

**Adding a fixture file**: files in `tests/fixtures/basic` are parsed by
dozens of tests. Adding a file changes graph stats (`graph --json`) and
affected-file counts for shared targets. Prefer adding a _new_ fixture
directory over mutating `basic`; if you must edit `basic`, run the full
suite and update every affected assertion deliberately.

## Changing the JSON schema

`analyze --json` / `graph --json` are stable contracts (see
`src/types/output.ts`). Additive, optional fields are fine. Renaming or
removing fields requires a major version bump and a note in the README.

## Releasing

1. Bump `version` in `package.json`.
2. `pnpm build && pnpm test && pnpm lint`.
3. Tag and push; CI runs the same gates.

## Code of conduct

Be kind. Assume good intent. This is a small tool and a small team.
