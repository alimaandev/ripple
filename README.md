<p align="center">
  <img src="assets/ripple-logo.png" alt="Ripple logo" width="160">
</p>

# 🌊 Ripple

A dependency-impact analysis CLI for TypeScript and JavaScript projects.

If you are about to change a file, Ripple answers the question:

> **What else will break if I change this file?**

It builds the project's dependency graph, walks backwards from a target file
to find everything that depends on it (transitively), and scores the blast
radius: affected routes, components, tests, entry points, shared utilities —
plus whether your target is hiding inside a circular dependency.

```text
🌊 Ripple Analysis

File            src/authentication/login.ts
Risk            MEDIUM
Affected Files:  7 files
Components      2
API Routes      4
Tests           1
Utilities       0
Max Depth       2
Confidence      100%

Top Impact
• Dashboard (2)
• Admin (1)

Affected Files (7)
├─ src/admin/page.tsx (depth 1)
├─ src/dashboard/page.tsx (depth 1)
└─ src/main.ts (depth 2)
```

## Features

- **Import-resolution aware** — handles path aliases (tsconfig `paths` and
  custom aliases), index files, `.js` → `.ts` import rewriting, dynamic
  `import()`, `require()`, `export … from`, and `import = require`.
- **Deterministic heuristics** — weighted risk score (0–100) with a
  transparent factor breakdown, no machine learning, no heuristics hidden in
  a black box.
- **Circular dependency detection** — strongly-connected components are
  reported with a concrete cycle path.
- **Both machines and humans covered** — `--json` emits a stable,
  versioned JSON contract; the default output is a readable terminal report.
- **Configurable** — `ripple.config.ts` / `.json` to tune globs, aliases and
  risk weights.
- **Safe by default** — parses with error recovery, ignores `node_modules`,
  and never writes to your source tree.

## Installation

```bash
npm install -g @ripple/cli
# or
pnpm add -g @ripple/cli
```

Ripple ships as a bundled ESM executable — no config needed before first run.

## Quick start

```bash
cd my-project
ripple analyze src/features/auth/login.ts   # terminal report
ripple analyze src/features/auth/login.ts --json   # machine-readable
ripple graph                                # project overview
ripple doctor                               # environment & project health
ripple init                                 # scaffold a ripple.config.json
```

## Commands

### `ripple analyze <file>`

Full impact analysis of one file.

| Flag                  | Description                                    |
| --------------------- | ---------------------------------------------- |
| `-j, --json`          | Emit a JSON report (stable schema, see below). |
| `-v, --verbose`       | Include the risk-factor point breakdown.       |
| `-d, --depth <n>`     | Cap the reverse traversal at `n` levels.       |
| `-c, --config <path>` | Use a specific config file.                    |
| `--no-color`          | Disable ANSI colors.                           |

### `ripple graph [file]`

Without a file, prints project-wide stats and circular dependencies.
With a file, prints the file's dependency tree.

| Flag                  | Description                                                   |
| --------------------- | ------------------------------------------------------------- |
| `-j, --json`          | JSON report.                                                  |
| `-r, --reverse`       | Show dependents (who imports the file) instead of dependants. |
| `-d, --depth <n>`     | Cap tree depth.                                               |
| `-c, --config <path>` | Use a specific config file.                                   |
| `--no-color`          | Disable ANSI colors.                                          |

### `ripple doctor`

Runs a set of independent health checks (Node version, config validity,
tsconfig, file discovery, parse rate, unresolved imports, cycles) and exits
non-zero if anything fails.

### `ripple init`

Creates `ripple.config.json` with the built-in defaults. Use `--force` to
overwrite an existing file.

## Configuration

Ripple discovers `ripple.config.ts`, `.mjs`, `.js`, `.cjs` or `.json` in the
current directory. An explicit `--config <path>` wins; the config's directory
becomes the project root.

```ts
// ripple.config.ts
import type { RippleConfig } from "ripple";

export default {
  include: ["src/**/*.{ts,tsx}"],
  ignore: ["src/generated"],
  aliases: { "@": "./src" },
  risk: {
    weights: {
      affectedFiles: 0.3,
      entryPoint: 0.15,
      sharedUtility: 0.15,
      publicExports: 0.1,
      tests: 0.1,
      routes: 0.1,
      cycleMembership: 0.1,
    },
    thresholds: { medium: 30, high: 55, critical: 80 },
  },
} satisfies RippleConfig;
```

All fields are optional; defaults apply field-by-field.

## How the risk score works

The score is a weighted sum of eight signals, each normalized to 0–1:

| Signal                             | Weight |
| ---------------------------------- | ------ |
| Affected files (log-scaled)        | 0.30   |
| An entry point is affected         | 0.15   |
| Shared utilities affected          | 0.15   |
| Target's public export surface     | 0.10   |
| Affected tests                     | 0.10   |
| Affected API routes                | 0.10   |
| Target is in a circular dependency | 0.10   |

The level thresholds are 30 (MEDIUM), 55 (HIGH) and 80 (CRITICAL). Run
`ripple analyze <file> --verbose` to see the point-by-point breakdown.

## JSON report schema

`ripple analyze --json` emits a stable contract with these fields:
`tool`, `version`, `command`, `file`, `risk`, `summary`, `affected`, `cycles`,
`targetInCycle`, `durationMs`. Paths are project-relative. The schema is
versioned with the CLI major version — renames require a major bump.

## Exit codes

| Code | Meaning                               |
| ---- | ------------------------------------- |
| `0`  | Success                               |
| `1`  | Failure (analysis could not complete) |
| `2`  | Target file not found                 |
| `3`  | Config missing/invalid                |

## Configuration troubleshooting

- **Config is not picked up** — `ripple analyze` uses the current working
  directory for discovery. Run from the project root, or pass `--config`.
- **Missing imports reported** — imports of non-source files (`.css`,
  `.json`) and bare packages are classified as _external_, which is
  intentional.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/architecture.md](docs/architecture.md).

## License

MIT
