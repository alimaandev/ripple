# Examples

## Minimal config

`ripple.config.json` created by `ripple init`:

```json
{
  "include": ["**/*.{ts,tsx,js,jsx}"],
  "ignore": ["node_modules", "dist", "build", "coverage", ".next", "out", ".git"],
  "aliases": {},
  "tsconfigPath": "tsconfig.json",
  "risk": {
    "weights": {
      "affectedFiles": 0.3,
      "entryPoint": 0.15,
      "sharedUtility": 0.15,
      "publicExports": 0.1,
      "tests": 0.1,
      "routes": 0.1,
      "cycleMembership": 0.1
    },
    "thresholds": {
      "medium": 30,
      "high": 55,
      "critical": 80
    }
  }
}
```

## Realistic session

```bash
# 1. First look at the project as a whole
$ ripple graph

🌊 Dependency Graph

Files            25
Edges            28
External         4
Unresolved       0
Circular groups  1

Circular Dependencies
⭕ src/circular/a.ts → src/circular/c.ts → src/circular/b.ts → src/circular/a.ts

# 2. Before changing the auth login handler
$ ripple analyze src/authentication/login.ts

# Risk is MEDIUM: an entry point is affected, 4 API routes and a test suite
# touch it transitively.

# 3. Break the cycle first, then re-analyze
$ ripple analyze src/circular/a.ts --json | jq .risk

{
  "score": 18.14,
  "level": "LOW",
  "factors": [ ... ]
}
```

## JSON consumption (CI guard)

```bash
#!/usr/bin/env bash
set -euo pipefail

# Fail the build when a change would be CRITICAL
report=$(ripple analyze "$1" --json)
level=$(echo "$report" | node -p "JSON.parse(require('fs').readFileSync(0)).risk.level")
if [ "$level" = "CRITICAL" ]; then
  echo "CRITICAL impact — review before merging"
  exit 1
fi
```
