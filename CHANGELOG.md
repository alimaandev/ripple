# Changelog

All notable changes to Ripple are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
