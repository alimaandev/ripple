import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    restoreMocks: true,
    // ts-morph + jiti suites are heavy; the default 5s timeout flakes under
    // parallel load (observed on Windows). Process isolation is slower but
    // stable across OSes.
    pool: "forks",
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/cli/bin.ts"],
      // Global floor for the unit suite. Integration tests spawn the CLI in a
      // child process (not instrumented), so thresholds are measured against
      // tests/unit only — `vitest run tests/unit --coverage`.
      thresholds: {
        statements: 65,
        branches: 50,
        functions: 68,
        lines: 65,
      },
    },
  },
});
