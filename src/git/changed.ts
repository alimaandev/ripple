import { execFileSync } from "node:child_process";
import path from "node:path";
import { RippleError } from "../utils/errors.js";
import { ExitCode } from "../types/cli.js";

/**
 * Git integration for `ripple diff`. All commands run from the repository
 * root and stay read-only — never modifies the working tree.
 *
 * Git reports tracked and untracked paths relative to the *repository* root,
 * not to the process working directory. `changedFiles` therefore resolves the
 * root once and returns it alongside the change set, so callers can turn every
 * path into an absolute path correctly even when Ripple runs from a package
 * subdirectory.
 */

export interface ChangedFiles {
  /** Human-readable base label, e.g. `origin/main`. */
  baseLabel: string;
  /** Absolute path of the repository root (`git rev-parse --show-toplevel`). */
  repoRoot: string;
  /** Repo-relative POSIX paths of changed files (tracked diffs + untracked). */
  files: string[];
}

/**
 * Base refs tried in order when neither `--base` nor `diff.base` is set.
 * Remote-tracking refs come before local branches: a local `main` often
 * points at the current branch tip, which would silently narrow the diff to
 * uncommitted edits.
 */
const DEFAULT_BASES = ["origin/HEAD", "origin/main", "origin/master", "main", "master"] as const;

function gitRaw(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** Git output minus the trailing newline; leading spaces are path content. */
function chomp(text: string): string {
  return text.replace(/\r?\n$/, "");
}

function git(args: string[], cwd: string): string {
  return gitRaw(args, cwd).trim();
}

/** Resolve the working tree root for `cwd`. */
export function repoRootFor(cwd: string): string {
  try {
    const root = chomp(gitRaw(["rev-parse", "--show-toplevel"], cwd));
    if (root) return path.resolve(root);
  } catch {
    /* fall through to the shared error below */
  }
  throw new RippleError(
    `Not a git repository: ${cwd}`,
    ExitCode.NotFound,
    "ripple diff needs a git repository. Run it from inside one, or pass --base only in a repo.",
  );
}

function refExists(ref: string, cwd: string): boolean {
  try {
    const out = git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], cwd);
    return out.length > 0;
  } catch {
    return false;
  }
}

function sameCommit(left: string, right: string, cwd: string): boolean {
  try {
    return (
      git(["rev-parse", `${left}^{commit}`], cwd) === git(["rev-parse", `${right}^{commit}`], cwd)
    );
  } catch {
    return false;
  }
}

function hasUncommittedChanges(cwd: string): boolean {
  try {
    return git(["status", "--porcelain", "--untracked-files=normal"], cwd).length > 0;
  } catch {
    return false;
  }
}

/**
 * Resolve the base ref: the requested one, a GitHub PR base when available,
 * or the first default that exists and is a meaningful comparison point.
 *
 * A default ref that points at HEAD cannot reveal committed branch work. It
 * is still returned when no better ref exists — the diff then covers only
 * uncommitted edits — but the warning makes sure a green gate is never
 * mistaken for "every change on this branch passed".
 */
export function resolveBase(cwd: string, requested?: string): string {
  if (requested) {
    if (!refExists(requested, cwd)) {
      throw new RippleError(`Git ref not found: ${requested}`, ExitCode.NotFound);
    }
    return requested;
  }

  const candidates: string[] = [];
  const githubBase = process.env.GITHUB_BASE_REF?.trim();
  if (githubBase) {
    candidates.push(`origin/${githubBase}`, githubBase);
  }
  candidates.push(...DEFAULT_BASES);

  const seen = new Set<string>();
  let headCandidate: string | undefined;
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    if (!refExists(candidate, cwd)) continue;
    if (sameCommit(candidate, "HEAD", cwd)) {
      headCandidate ??= candidate;
      continue;
    }
    return candidate;
  }

  if (headCandidate !== undefined) {
    const detail = hasUncommittedChanges(cwd)
      ? "Only uncommitted changes are analyzed"
      : "The working tree is clean, so the change set is empty";
    process.stderr.write(
      `ripple: warning: base ref "${headCandidate}" resolves to HEAD. ` +
        `${detail} — pass --base <ref> to compare against a branch.\n`,
    );
    return headCandidate;
  }

  if (refExists("HEAD~1", cwd)) {
    process.stderr.write(
      "ripple: warning: no branch base found; falling back to HEAD~1. " +
        "Only the last commit will be analyzed — pass --base <ref> for a full change set.\n",
    );
    return "HEAD~1";
  }

  throw new RippleError(
    `No git base ref found (tried ${candidates.join(", ")}). Pass --base <ref> explicitly.`,
    ExitCode.NotFound,
  );
}

/** Split NUL-delimited `git -z` output into exact paths. */
function nulPaths(output: string): string[] {
  return output.split("\0").filter((entry) => entry.length > 0);
}

/**
 * Ripple's own cache lives inside the project and may not be gitignored.
 * Treating it as a changed file would make the second `ripple diff` in a row
 * see a different change set than the first, so any `.ripple/` directory —
 * at the repository root or inside a package — is excluded.
 */
function isRippleArtifact(repoPath: string): boolean {
  return repoPath.replace(/\\/g, "/").split("/").includes(".ripple");
}

/**
 * Compute the changed file set: everything that differs from the base
 * (merged commits plus uncommitted edits) and any untracked files.
 *
 * All git commands run from the repository root and use `-z` so paths with
 * spaces, quotes or non-ASCII characters survive intact.
 */
export function changedFiles(cwd: string, base?: string): ChangedFiles {
  const repoRoot = repoRootFor(cwd);
  const baseLabel = resolveBase(repoRoot, base);
  let baseCommit = baseLabel;
  try {
    // Criss-cross merges can produce several merge bases; any one is a valid
    // left-hand side for the change set.
    const mergeBase = git(["merge-base", baseLabel, "HEAD"], repoRoot).split(/\r?\n/)[0]?.trim();
    if (mergeBase) baseCommit = mergeBase;
  } catch {
    /* base may be HEAD or a single commit — use it directly */
  }

  const files = new Set<string>();
  const tracked = nulPaths(
    gitRaw(["diff", "--name-only", "-z", "--diff-filter=ACMRT", baseCommit, "--"], repoRoot),
  );
  for (const file of tracked) {
    if (!isRippleArtifact(file)) files.add(file);
  }
  const untracked = nulPaths(
    gitRaw(["ls-files", "--others", "--exclude-standard", "-z"], repoRoot),
  );
  for (const file of untracked) {
    if (!isRippleArtifact(file)) files.add(file);
  }

  return { baseLabel, repoRoot, files: [...files].sort() };
}
