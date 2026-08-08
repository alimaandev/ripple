# Changelog

All notable changes to Ripple are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-08-08

### Added

- `ripple diff --format github` — GitHub Actions workflow-command output.
  Each changed source file becomes a PR annotation on the Files tab:
  `::error` when it blocks the gate, `::warning` otherwise, plus a
  `::notice` gate verdict. The exit code still carries the verdict.
- `--format <terminal|json|github>` replaces the JSON-only switch;
  `--json` remains as shorthand for `--format json`.
- Unit tests for the annotation builder (levels, escaping, pluralization)
  and integration tests for the workflow output and `--format` validation.

## [0.4.0] - 2026-08-08

### Added

- Config-driven `ripple diff`: a `diff` block in `ripple.config.*`
  (`diff.base`, `diff.gate`) sets the base ref and gate level when the
  corresponding flag is omitted. Precedence: `--base`/`--gate` flags >
  config file > built-in defaults (`origin/main` → `main` → `HEAD~1`,
  `high`).
- `DiffConfig` is part of the typed public API, so `ripple.config.ts`
  authors get autocomplete and validation for the `diff` block.
- Unit + integration coverage for config-driven base/gate resolution and
  flag-over-config precedence.
- Contributor-facing repository setup: `CODE_OF_CONDUCT.md`, `SECURITY.md`,
  required issue forms (bug + feature), pull request template, and a
  refreshed `CONTRIBUTING.md` with a first-PR walkthrough and the
  automated release flow.
- CI test matrix now covers Node 22 on Linux and Windows plus Node 24 on
  Linux; the `dogfood` job runs `ripple diff --gate high` on every pull
  request so Ripple gates its own PRs.
- Dependabot (weekly, grouped) with automated security alerts and
  `test:unit` / `test:integration` convenience scripts.

### Changed

- Test runner uses a forked process pool with a 30s per-test timeout —
  eliminates the intermittent timeouts of the heavy ts-morph suites.
- `npm publish` warning about the `bin` path is gone (`npm pkg fix`).
- Line endings are normalized repo-wide via `.gitattributes`.
- esbuild lifted to 0.28.1 to close Dependabot alert #1 (arbitrary file
  read via the dev server on Windows) and satisfy vite's peer requirement.

## [0.3.0] - 2026-08-08

### Added

- `ripple diff` — change-set gating. Analyzes every file changed since a
  base git ref (`origin/main`, then `main`, then `HEAD~1`, or `--base <ref>`),
  scores each file with the same risk model as `analyze`, and blocks when
  any file reaches the gate level. Helpful for PR/CI gates.
- `--gate <medium|high|critical>` — minimum level that blocks the gate
  (HIGH by default), for both terminal and `--json` reports.
- Deleted files and non-source changes are reported but skipped; untracked
  files are included.
- `diff --json` contract: per-file risk summary plus `gate.blocked` verdict
  wired to the exit code, so CI only reads one boolean.
- Per-file details in the diff contract: `analyzed`, `affectedFiles`,
  `targetInCycle`, and `risk` (when analyzed).
- Unit tests for `src/git/changed.ts` (real git invocations against scratch
  repositories) and `src/commands/diff.ts` report helpers; integration tests
  for the CLI's diff surface.

### Changed

- Exit code `2` now also covers an unresolvable `--base` git ref (in
  addition to a missing target file).

### Fixed

- (none)

## [0.2.0] - 2026-08-07

### Added

- Branded terminal UI: boxed `ripple` header card on every command, risk
  gauge bar (`███░░░░░░░` next to the score), hairline section dividers,
  and cross-platform glyphs via `figures`.
- Staged progress tracking in interactive terminals — each pipeline stage
  prints as a checkmarked line with its elapsed time (`✔ Building graph
(118ms)`), silent in CI and pipes.
- `--no-color` now also respects the standard `NO_COLOR` environment
  variable; colorless output stays clean and deterministic for logs.
- New `src/ui/` module with unit-tested icon, gauge, and branding helpers.

### Changed

- `analyze`/`graph`/`doctor` reports redesigned: single-line impact summary
  (`4 routes · 2 components · 1 test`), aligned key-value block, and
  inline risk score.
- README terminal samples and `assets/hero.svg` regenerated from the new
  output.

### Fixed

- The risk score was computed but never printed in terminal reports — it is
  now shown alongside the level and the gauge.

## [0.1.1] - 2026-08-07

### Added

- Typed public API — `import type { RippleConfig } from "@alimaandev/ripple"` for fully-typed `ripple.config.ts` files.
- `export` map / `types` entry and `publishConfig.access: public` for reliable publishing.
- `CHANGELOG.md`.

### Changed

- README images use absolute URLs so the npm package page renders them correctly.

## [0.1.0] - 2026-08-07

Initial release. `@alimaandev/ripple` is published to npm.

### Added

- `ripple analyze <file>` — reverse dependency traversal, risk score, and a
  terminal or JSON report.
- `ripple graph [file]` — project stats, dependency trees, and cycle
  detection (Kosaraju SCC, iterative).
- `ripple doctor` — independent project and environment health checks.
- `ripple init` — scaffold a `ripple.config.json`.
- Risk scoring from seven weighted signals with configurable weights and
  thresholds; separate confidence score.
- Path alias support (tsconfig `paths` + custom aliases, single-wildcard).
- Stable JSON contract for CI gates (`analyze --json`, `graph --json`).
- Error-tolerant parsing — broken files lower confidence, never abort a run.
- Deterministic, offline analysis; no network calls, no telemetry.
