import { execFileSync } from "node:child_process";
import { RippleError } from "../utils/errors.js";
import { ExitCode } from "../types/cli.js";

/**
 * Git integration for `ripple diff`. All commands run in the project
 * directory and stay read-only — never modifies the working tree.
 */

export interface ChangedFiles {
  /** Human-readable base label, e.g. `origin/main`. */
  baseLabel: string;
  /** Repo-relative paths of changed files (tracked diffs + untracked). */
  files: string[];
}

/** Base refs tried in order when `--base` is not given. */
const DEFAULT_BASES = ["origin/main", "main", "HEAD~1"];

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function refExists(ref: string, cwd: string): boolean {
  try {
    const out = git(["rev-parse", "--verify", ref], cwd);
    return out.length > 0;
  } catch {
    return false;
  }
}

/** Resolve the base ref: the requested one, or the first default that exists. */
export function resolveBase(cwd: string, requested?: string): string {
  if (requested) {
    if (!refExists(requested, cwd)) {
      throw new RippleError(`Git ref not found: ${requested}`, ExitCode.NotFound);
    }
    return requested;
  }
  for (const candidate of DEFAULT_BASES) {
    if (refExists(candidate, cwd)) return candidate;
  }
  throw new RippleError(
    "No git base ref found (tried origin/main, main, HEAD~1). Pass --base <ref> explicitly.",
    ExitCode.NotFound,
  );
}

/**
 * Compute the changed file set: everything that differs from the base
 * (merged commits plus uncommitted edits) and any untracked files.
 */
export function changedFiles(cwd: string, base?: string): ChangedFiles {
  const baseLabel = resolveBase(cwd, base);
  let baseCommit = baseLabel;
  try {
    const mergeBase = git(["merge-base", baseLabel, "HEAD"], cwd);
    if (mergeBase) baseCommit = mergeBase;
  } catch {
    /* base may be HEAD or a single commit — use it directly */
  }

  const files = new Set<string>();
  const tracked = git(["diff", "--name-only", "--diff-filter=ACMRT", baseCommit], cwd);
  for (const line of tracked.split("\n")) {
    if (line.trim()) files.add(line.trim());
  }
  const untracked = git(["ls-files", "--others", "--exclude-standard"], cwd);
  for (const line of untracked.split("\n")) {
    if (line.trim()) files.add(line.trim());
  }

  return { baseLabel, files: [...files].sort() };
}
