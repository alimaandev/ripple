<p align="center">
  <img src="assets/ripple-logo.png?v=3" alt="Ripple logo" width="160">
</p>

<h1 align="center">Ripple</h1>

<p align="center">
  Dependency impact analysis for TypeScript and JavaScript projects.
  Before you change a file, Ripple tells you what else breaks.
</p>

<p align="center">
  <a href="https://github.com/alimaandev/ripple/actions/workflows/ci.yml">
    <img alt="CI" src="https://github.com/alimaandev/ripple/actions/workflows/ci.yml/badge.svg">
  </a>
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg">
  <img alt="Node: >= 22" src="https://img.shields.io/badge/node-%3E%3D22-339933.svg">
</p>

---

## Why Ripple?

Changing a file in a non-trivial codebase raises a simple question that most
tooling cannot answer:

> Who imports this file, directly and transitively — and how much does it
> matter?

Grepping imports breaks down past one hop. Package managers tell you about
dependencies, not dependents. Refactoring is often stalled by not knowing the
blast radius.

Ripple builds the full import graph of your project once, then answers the
question in one command: a dependency walk, a risk score, and a list of
everything affected — routes, components, tests, entry points, and any
circular dependencies involved. It is deterministic, offline, and runs
against the code you actually have.

## Features

- **Reverse dependency traversal** — find every file that imports a target,
  transitively, with depth, capped via `--depth`.
- **Risk scoring** — a transparent 0–100 score from seven weighted signals
  (see [Risk scoring](#risk-scoring)), with a per-factor breakdown in
  `--verbose`.
- **Circular dependency detection** — strongly-connected components with a
  concrete cycle path (`a → c → b → a`).
- **Path alias support** — tsconfig `paths` and custom aliases
  (`{ "@": "./src" }`), including single-wildcard patterns.
- **Real-world import resolution** — extension probing, index files, `.js` →
  `.ts` rewriting, dynamic `import()`, `require()`, `export … from`, and
  `import = require`. Non-source imports (`.css`, packages) are classified as
  external, not broken.
- **Entry-point detection** — `package.json` `main`/`bin` plus conventional
  root and `src` entry files.
- **File categorization** — routes, pages, layouts, components, utilities,
  and tests detected by path conventions.
- **Terminal and JSON output** — a readable report by default, a stable
  machine-readable contract with `--json`.
- **Error-tolerant parsing** — a broken file degrades the confidence score
  instead of aborting the run.
- **Deterministic and offline** — no network calls, no non-deterministic
  ordering, same input → same output.

## Quick start

### Requirements

- Node.js ≥ 22
- pnpm (repo uses pnpm 11)

### Install from source

```bash
git clone https://github.com/alimaandev/ripple.git
cd ripple
pnpm install
pnpm build
npm link        # exposes the global `ripple` binary
```

Verify:

```bash
ripple version
```

### Run it

Ripple ships a complete sample project in `tests/fixtures/basic`. Point the
CLI at it:

```bash
cd tests/fixtures/basic
ripple analyze src/authentication/login.ts
```

Expected output:

```text
🌊 Ripple Analysis

File            src/authentication/login.ts
Risk            MEDIUM
Affected Files  7 files
Components      2
API Routes      4
Tests           1
Utilities       0
Max Depth       2
Confidence      100%

Top Impact
• Dashboard (2)
• Admin (1)
• Index TS (1)

Circular Dependencies
⭕ src/circular/a.ts → src/circular/c.ts → src/circular/b.ts → src/circular/a.ts

Affected Files (7)
├─ src/admin/page.tsx (depth 1)
├─ src/dashboard/page.tsx (depth 1)
└─ src/main.ts (depth 2)
```

## Usage

```text
ripple [command]

Commands:
  analyze <file>   Impact analysis of a file
  graph [file]     Project stats, or one file's dependency tree
  doctor           Project and environment health check
  init             Create a ripple.config.json
  version          Print the version
```

### `ripple analyze <file>`

| Flag                  | Description                                         |
| --------------------- | --------------------------------------------------- |
| `-j, --json`          | Emit the JSON report instead of the terminal report |
| `-v, --verbose`       | Include the risk-factor point breakdown             |
| `-d, --depth <n>`     | Cap the reverse traversal at `n` levels             |
| `-c, --config <path>` | Use a specific config file                          |
| `--no-color`          | Disable ANSI colors                                 |

### `ripple graph [file]`

Without a file: project-wide stats and circular dependencies. With a file:
the file's import tree.

| Flag                  | Description                                                   |
| --------------------- | ------------------------------------------------------------- |
| `-j, --json`          | Emit the JSON report                                          |
| `-r, --reverse`       | Show dependents (what imports the file) instead of dependants |
| `-d, --depth <n>`     | Cap tree depth                                                |
| `-c, --config <path>` | Use a specific config file                                    |
| `--no-color`          | Disable ANSI colors                                           |

### `ripple doctor`

Runs independent health checks — config validity, tsconfig presence, source
discovery, parse rate, unresolved imports, cycles. Exits non-zero when any
check fails.

### `ripple init`

Writes `ripple.config.json` with the defaults. `-f, --force` overwrites an
existing file.

## Configuration

Ripple discovers `ripple.config.ts`, `.mjs`, `.js`, `.cjs`, or `.json` in the
current directory. An explicit `--config <path>` wins; the config's directory
becomes the project root. Every field is optional.

```ts
// ripple.config.ts
export default {
  include: ["src/**/*.{ts,tsx}"],
  ignore: ["src/generated"],
  aliases: { "@": "./src" },
};
```

| Field             | Default                                                             | Purpose                                                |
| ----------------- | ------------------------------------------------------------------- | ------------------------------------------------------ |
| `include`         | `**/*.{ts,tsx,js,jsx}`                                              | Source globs to analyze                                |
| `ignore`          | `node_modules`, `dist`, `build`, `coverage`, `.next`, `out`, `.git` | Exclusions                                             |
| `aliases`         | `{}`                                                                | Path aliases, merged with tsconfig `paths` (user wins) |
| `tsconfigPath`    | `tsconfig.json`                                                     | tsconfig to read for `paths`                           |
| `risk.weights`    | see below                                                           | Risk signal weights                                    |
| `risk.thresholds` | 30 / 55 / 80                                                        | Score thresholds for MEDIUM / HIGH / CRITICAL          |

`node_modules` is always excluded, regardless of config.

## Risk scoring

The score is a weighted sum of seven signals, each normalized to 0–1.
Affected counts are log-scaled so large graphs cannot dominate:

| Signal                          | Weight |
| ------------------------------- | ------ |
| Affected files                  | 0.30   |
| Entry point impacted            | 0.15   |
| Shared utilities impacted       | 0.15   |
| Target's public export surface  | 0.10   |
| Tests impacted                  | 0.10   |
| API routes impacted             | 0.10   |
| Target in a circular dependency | 0.10   |

The result is a score (0–100) and a level: LOW, MEDIUM, HIGH, or CRITICAL.
`ripple analyze <file> --verbose` prints the point-by-point breakdown.
Weights and thresholds are configurable under `risk`.

Confidence (0–100) is a separate measure of how trustworthy the analysis is:
it drops when files fail to parse or imports stay unresolved, and is
penalized when the target is inside a cycle.

## JSON output

`ripple analyze --json` emits a stable contract — additive changes only,
renames require a major version bump:

```jsonc
{
  "tool": "ripple",
  "version": "0.1.0",
  "command": "analyze",
  "file": "src/authentication/login.ts",
  "risk": { "score": 34.69, "level": "MEDIUM", "factors": [] },
  "summary": { "affectedFiles": 7, "routes": 4, "components": 2, "tests": 1 },
  "affected": [{ "path": "src/main.ts", "depth": 2, "inCycle": false }],
  "cycles": [{ "members": [], "path": [] }],
  "targetInCycle": false,
  "durationMs": 42,
}
```

Paths are project-relative. `graph --json` follows the same shape for its
fields.

## Exit codes

| Code | Meaning                   |
| ---- | ------------------------- |
| `0`  | Success                   |
| `1`  | Failure                   |
| `2`  | Target file not found     |
| `3`  | Config missing or invalid |

## Development

```bash
pnpm install
pnpm run dev          # tsup watch mode
pnpm run typecheck    # tsc --noEmit
pnpm run lint         # eslint
pnpm run format:check # prettier
pnpm run test         # unit + integration tests
pnpm run build        # bundle dist/bin.js
```

The repository layout, design decisions, and the analysis pipeline are
documented in [docs/architecture.md](docs/architecture.md). Before touching
code, read [CONTRIBUTING.md](CONTRIBUTING.md) — especially the note about
`tests/fixtures/basic`, which dozens of tests depend on.

## License

MIT — see [LICENSE](LICENSE).
