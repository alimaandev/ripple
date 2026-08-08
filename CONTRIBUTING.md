# Contributing to Ripple

Thanks for wanting to help, we love the interest. This file explains how the
repository is organized and how to contribute safely.

Please read it first — it answers most questions about where code lives,
what the conventions are, and how a change becomes a release.

- [Code of Conduct](CODE_OF_CONDUCT.md) — everyone is expected to follow it.
- [Security](SECURITY.md) — report vulnerabilities privately, not as issues.

## Your first PR

1. **Fork** the repository and clone your fork:

   ```bash
   git clone https://github.com/alimaandev/ripple.git
   cd ripple
   ```

   (Or add it as an upstream if you cloned your own fork first.)

2. **Install** — Node.js >= 22 and pnpm are required:

   ```bash
   pnpm install
   ```

3. **Make a branch** for your change — `fix/…`, `feat/…`, `docs/…`:

   ```bash
   git checkout -b feat/my-change
   ```

4. **Verify your change** before committing:

   ```bash
   pnpm run typecheck    # tsc --noEmit
   pnpm run lint         # eslint (without config issues)
   pnpm run format       # prettier --write
   pnpm run test         # vitest run — full unit + integration suite
   ```

   All four must pass. CI runs exactly these gates (plus a build) on every
   push and pull request.

5. **Open a pull request** using the template. Small PRs focused
   on one concern are far more likely to be merged quickly.

Care about the reader: if your PR touches user-facing behavior
(commands, flags, JSON fields), update the matching section in `README.md`
and add a `CHANGELOG.md` entry under `## [Unreleased]`.

## Prerequisites

- Node.js >= 22
- pnpm

## Setup

```bash
pnpm install
pnpm build        # bundle the CLI into dist/
pnpm test         # unit + integration tests
pnpm lint         # eslint
pnpm format:check # prettier --check
pnpm typecheck    # tsc --noEmit
```

## Repository layout

```text
src/
  cli/            commander program, bin entry, spinner
  commands/       one module per command (analyze, graph, diff, doctor, init)
  git/            read-only git integration for `diff` (change-set discovery)
  analyzer/       reverse traversal, categorization, impact summary, confidence
  risk/           scoring model (weights, levels, thresholds)
  parser/         ts-morph-based import/export/symbol extraction
  graph/          edge resolution, graph construction, cycle detection
  scanner/        source-file discovery
  config/         zod validation, defaults, alias map, jiti loading
  formatter/      text/table/tree/json rendering (pure functions)
  output/         writers + report assembly
  ui/             branding, gauge, icons, progress, color helpers
  types/          shared TypeScript contracts
  utils/          path, fs, glob, tsconfig helpers
tests/
  fixtures/       sample projects used by unit + integration tests
  unit/           fast tests, no process spawning (mirrors src/ structure)
  integration/    end-to-end CLI runs against fixtures
  helpers/        fixture path helpers
docs/             architecture and design notes
examples/         commented usage walkthrough
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
- Internals stay type-safe; new commands extend `src/types/cli.ts`
  `DiffOptions`/`AnalyzeOptions`-style option interfaces.

## Testing

Unit tests: `pnpm test:unit` — fast, no process spawning. The heavy
`tests/unit/output/report.test.ts` and `tests/unit/analyzer/*` suites build
a real ts-morph project and are run with relaxed timeouts (see
`vitest.config.ts`).

Integration tests: `pnpm test:integration` — spawns the real CLI against
`tests/fixtures/basic` and asserts exit codes and output. They are slower
(a cold jiti + ts-morph start is a few seconds), so keep fixture-level
expectations coarse.

**Adding a fixture file**: files in `tests/fixtures/basic` are parsed by
dozens of tests. Adding a file changes graph stats (`graph --json`) and
affected-file counts for shared targets. Prefer adding a _new_ fixture
directory over mutating `basic`; if you must edit `basic`, run the full
suite and update every affected assertion deliberately.

## Changing the JSON schema

`analyze --json` / `graph --json` / `diff --json` are stable contracts
(see `src/types/output.ts`). Additive, optional fields are fine. Renaming
or removing fields requires a major version bump and a note in the README.

## Changelog

We follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Add a line under `## [Unreleased]` for every user-facing change:

- Added — new features, flags, contracts
- Changed — behavior edits, defaults
- Fixed — bug repairs
- Removed — deleted behavior

## Releasing

Releases are automated: pushing a `v*` tag runs CI gates (typecheck,
lint, tests, build) and publishes the package to npm
(`.github/workflows/publish.yml`).

1. Bump `version` in `package.json` and move CHANGELOG entries from
   `[Unreleased]` into a dated `[x.y.z]` section.
2. Merge to `main`, then tag from the updated main:

   ```bash
   git push ripple main --tags
   git tag v0.x.y
   git push ripple v0.x.y
   ```

   The Publish workflow takes it from there. Verify with
   `npx @alimaandev/ripple version`.

## Code of conduct

Everyone taking part in this project must follow the
[Code of Conduct](CODE_OF_CONDUCT.md). Contact
[alishermaan0319@gmail.com](mailto:alishermaan0319@gmail.com) to report a
violation or ask a question.
