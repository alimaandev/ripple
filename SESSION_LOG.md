# Ripple 0.7.0 Release Session — Full Chat Log

**Date:** 2026-08-18  
**Project:** Ripple — dependency impact analysis for TypeScript/JavaScript  
**Repo:** alimaandev/ripple (remote: `ripple` → https://github.com/alimaandev/ripple.git)  
**Branch protection:** PRs required, strict, 7 checks (lint, test ubuntu 22/24, test windows 22, build, dogfood, coverage)  
**Publish workflow:** `.github/workflows/publish.yml` triggers on `v*` tags → npm publish with `NPM_TOKEN` secret  

---

## Session Overview

This session completed the **v0.7.0 release** ("AI-ready risk gate: SARIF, MCP server, faster cache") and established weekly metrics tracking. All Phase A–C work is merged and published; Phase D (outreach drafts ready) and Phase E (weekly tracking) remain.

---

## Initial State (User: "What did we do so far?")

### Prior Summary (before this session)

**Phase A (features) — complete, merged in PR #22 (14c7e24):**
- Incremental parse cache (schema 2): `.ripple/cache/parsed-v2.json`, mtime+size fast path, parallel stats (`Promise.all`), atomic writes, `RIPPLE_NO_CACHE=1` disables
- Error-tolerant parsing: broken files record `parseError` instead of aborting
- SARIF 2.1.0 output: `ripple diff --sarif` / `ripple analyze --sarif` with stable `primaryLocationLineHash`
- `ripple mcp` — MCP server (stdio, protocol 2025-06-18) exposing `impact`, `dependents`, `risk`, `gate_status`
- `ripple-action@v1` wraps SARIF + gate; `upload-sarif: true` default
- Benchmarks: seeded synthetic projects, median of 5, cold vs warm, deterministic (byte-identical excl. duration)
  - 200 files: graph 1.20x, analyze 1.18x
  - 500: 1.28x / 1.38x
  - 1000: 1.49x / 1.54x
  - 2000: 1.63x / 1.73x
- `RIPPLE_TRACE=1` per-stage marks (pipeline marks are cumulative elapsed-since-start, NOT per-stage)
- Clean lint/typecheck/prettier; 205 unit + 47 integration tests pass

**Phase B (launch assets) — complete, merged in PR #26:**
- `assets/hero-animated.svg` (SMIL typewriter, 22s loop)
- `assets/mcp-demo.svg` (agent → ripple mcp flow)
- README hero swap + MCP section diagram
- 3 good-first-issues seeded: #23 (doctor --json), #24 (config JSON Schema), #25 (diff friendly git errors)
- funding.yml skipped (user decision)

**Phase C (cut 0.7.0) — in progress at session start:**
- `package.json` → 0.7.0 ✓
- CHANGELOG `[Unreleased]` → `[0.7.0] - 2026-08-18` ✓
- `pnpm install` refreshed lockfile ✓
- README still had stale version refs + **double-encoded UTF-8 mojibake** (UTF-8 bytes misread as cp1252 then re-encoded; e.g., `→` stored as literal `â†'`)
- Diagnostic script written: `fix-mojibake.mjs` (unrun)

---

## Session Work Log

### 1. Mojibake Fix (README + repo-wide)

**Problem:** README had 410 non-ASCII chars, 142 mojibake (`â/Ã/Â`). PowerShell console rendering artifacts (`�?"`) masked true state. Earlier `WriteAllText` from misread `Get-Content -Raw` introduced corruption into working tree.

**Fix approach:** Reverse double-encode per file:
1. UTF-8 decode file → mojibake chars (U+00E2 U+2020 U+2019 for `â†'`)
2. Map each char to its cp1252 byte (via inverted `TextDecoder("windows-1252")` over 0..255)
3. UTF-8 decode the resulting byte array → original clean text (`→`)

**Key bug discovered:** Initial script decoded final bytes with cp1252 again (no-op). Fixed to decode with UTF-8.

**Results:**
- README: 74 lines fixed, now clean (142 legitimate non-ASCII remain: `→ · – — ● ├ └`)
- `src/cache/parsed.ts`: 5 lines fixed (committed mojibake in doc comments — em-dashes/arrows)
- CHANGELOG/BENCHMARKS: mixed clean + clean (no mojibake) → safely skipped by line-level guard (lines with `→ █ ░ ✔` not in cp1252)
- Full repo sweep: **CLEAN** (zero remaining mojibake patterns)

### 2. README Version Refs Update

After mojibake fix, the 3 stale `0.6.0` references updated to `0.7.0`:
- `ripple version                  # → 0.7.0`
- `ripple · impact analysis · v0.7.0`
- `ripple · dependency graph · v0.7.0`

### 3. Release PR #27

**Branch:** `release/0.7.0`  
**Changes:** package.json, CHANGELOG, README version refs, parsed.ts mojibake fix  
**Checks:** All 7 green (build, coverage, dogfood, lint, test ubuntu 22/24, test windows 22)  
**Merge:** Squash → `6122e05 chore(release): v0.7.0 — version bump, changelog, docs sync (#27)`

### 4. Publish (Tag → Workflow → npm)

**Tag:** `v0.7.0` pushed to `ripple`  
**Workflow:** `publish.yml` (run 32120383876) — **completed / success** (typecheck → lint → test → build → npm publish)  
**npm:** `@alimaandev/ripple@0.7.0` live (verified `npm view`)

### 5. GitHub Release

**Release:** v0.7.0 created with full notes (SARIF, MCP, cache benchmarks, action usage, good-first-issues links)  
**URL:** https://github.com/alimaandev/ripple/releases/tag/v0.7.0

### 6. Smoke Test (Published Package)

**Temp install:** `npm install @alimaandev/ripple@0.7.0` in `C:\Users\Bilal\AppData\Local\Temp\opencode\smoke-070`

| Command | Result |
|---|---|
| `ripple version` | `0.7.0` ✓ |
| `ripple analyze src/index.ts` | Risk LOW 2.0/100, cycle detected ✓ |
| `ripple analyze --sarif` | Valid SARIF 2.1.0 JSON ✓ |
| `ripple mcp` (tools/list via JSON-RPC) | 4 tools: `impact`, `dependents`, `risk`, `gate_status` ✓ |

**Note:** Absolute paths with spaces failed in `.cmd` wrapper (quoting quirk); relative paths work — realistic usage.

### 7. ripple-action Check

**Repo:** alimaandev/ripple-action  
**action.yml:** `version: latest` (default) → auto-resolves to 0.7.0  
**smoke.yml:** runs action on own repo with `gate: critical`; `upload-sarif: true` default → exercises SARIF path  
**Verdict:** No changes needed; 0.7.0 activates SARIF automatically

### 8. Metrics Harness + Baseline (PR #28)

**Script:** `scripts/metrics.mjs` (`pnpm run metrics`)
- GitHub via `gh api`: stars, forks, contributors, open issues (excl. PRs)
- npm: `https://api.npmjs.org/downloads/point/last-week/@alimaandev/ripple`
- Action repo: stars, forks
- Idempotent per day (updates existing row); `--json` for raw; `--note "..."` for context
- Writes `METRICS.md` with targets header + table

**eslint.config.mjs:** Added `fetch` global for scripts  
**package.json:** Added `"metrics": "node scripts/metrics.mjs"`

**Baseline (2026-08-18):**
| Date | Stars | Forks | Contributors | Open issues | Weekly downloads | Action stars | Action forks | Notes |
|---|---|---|---|---|---|---|---|---|
| 2026-08-18 | 1 | 1 | 2 | 3 | 254 | 0 | 0 | baseline - v0.7.0 released |

**Observation:** 254 weekly downloads already (pre-outreach); 2 contributors (one beyond author).

**PR #28:** All 7 checks green → squash-merged → main synced to `432d816`

### 9. Outreach Drafts (Ready for Review)

Created in `C:\Users\Bilal\AppData\Local\Temp\opencode\outreach\`:

| File | Target | Key Content |
|---|---|---|
| `producthunt.md` | Product Hunt | Full listing + first comment + launch logistics (best window Tue–Thu 00:01–07:00 PT) |
| `hackernews.md` | HN Show HN | 3 title options + first comment on 4 design decisions (real graph, determinism, computed risk, one engine) |
| `reddit-typescript.md` | r/typescript | Concrete CLI output + ask for feedback on risk weighting |
| `devto.md` | dev.to | ~4 min article "The merge gate that knows the blast radius" |

All use verified numbers (risk output, 1.2–1.7x cache, 4 MCP tools, SARIF fingerprints).

---

## Key Technical Decisions Captured

1. **Windows + PowerShell constraints:** No heredocs (`<<` fails); write bodies to temp files + `--body-file`; avoid inline `node -e`; byte-accurate file reads via `[System.IO.File]::ReadAllBytes` + `GetString` (Select-String reads as ANSI).

2. **Mojibake reversal:** Must encode chars → cp1252 bytes → UTF-8 decode (NOT cp1252 decode). Inverted `TextDecoder("windows-1252")` over 0..255 gives exact char→byte map.

3. **Pipeline marks are cumulative:** `RIPPLE_TRACE=1` prints `pipeline.stage: Nms` = elapsed since start, NOT stage duration. Per-stage timing comes from `cache.*`, `graph.*`, `detectEntryPoints` marks.

4. **Branch protection strictness:** Direct push to main blocked; must PR → checks → squash merge. If "head not up to date", merge `ripple/main` into branch and re-push.

5. **Publish path:** Only via tag workflow (`NPM_TOKEN` secret exists; local npm 401). Tag `v*` triggers full CI + `npm publish --access public`.

6. **Benchmark methodology:** Seeded synthetic projects only (no real-repo clones); `--repeats` flag (default 3, used 5); determinism = all cold+warm JSON byte-identical vs referenceHash of first cold run.

---

## Files Changed This Session

### Committed (via PRs #27, #28)
- `package.json` — version 0.7.0, `metrics` script
- `CHANGELOG.md` — `[0.7.0] - 2026-08-18` section
- `README.md` — version refs → 0.7.0, mojibake fixed
- `src/cache/parsed.ts` — mojibake fixed in doc comments (5 lines)
- `eslint.config.mjs` — `fetch` global for scripts
- `scripts/metrics.mjs` — new weekly metrics snapshot script
- `METRICS.md` — new tracking file with baseline row
- `pnpm-lock.yaml` — refreshed (no version pin)

### Temp / Diagnostic (not committed)
- `C:\Users\Bilal\AppData\Local\Temp\opencode\fix-mojibake.mjs` — mojibake diagnostic + reverse transform
- `C:\Users\Bilal\AppData\Local\Temp\opencode\fix-all-mojibake.mjs` — line-level safe transform for whole repo
- `C:\Users\Bilal\AppData\Local\Temp\opencode\mojibake-sweep.mjs` — final verification sweep
- `C:\Users\Bilal\AppData\Local\Temp\opencode\mbtest.mjs` — cp1252 map debug
- `C:\Users\Bilal\AppData\Local\Temp\opencode\chg-diagnose.mjs` — CHANGELOG unmappable char check
- `C:\Users\Bilal\AppData\Local\Temp\opencode\release-notes.md` — GitHub release body
- `C:\Users\Bilal\AppData\Local\Temp\opencode\outreach\*.md` — 4 outreach drafts

---

## Current State (Session End)

| Area | Status |
|---|---|
| **npm package** | 0.7.0 live |
| **GitHub release** | Created with notes |
| **Main branch** | Synced to `ripple/main` (432d816) |
| **Mojibake** | Repo-wide CLEAN |
| **Metrics** | Harness + baseline committed; weekly `pnpm run metrics` ready |
| **Outreach** | 4 drafts ready; awaiting user review + publish timing |
| **Action repo** | Auto-picks 0.7.0 via `latest`; SARIF path active |

---

## Next Steps (User-Driven)

1. **Review outreach drafts** in `Temp\opencode\outreach\`; publish when ready (PH timing critical)
2. **Run `pnpm run metrics` weekly** to append rows to METRICS.md
3. **Monitor targets:** 1K stars, 10K weekly downloads, 100 action installs, 5 contributors, PH top-5, HN front page

---

## Commands Reference

```bash
# Weekly metrics snapshot
pnpm run metrics                    # writes METRICS.md
pnpm run metrics -- --json          # raw JSON to stdout
pnpm run metrics -- --note "text"   # with note column

# Release (if needed again)
git tag vX.Y.Z
git push ripple vX.Y.Z
# watch: gh run list --workflow publish.yml --limit 1

# Outreach drafts location
C:\Users\Bilal\AppData\Local\Temp\opencode\outreach\
```

---

*End of session log*