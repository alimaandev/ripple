import chalk from "chalk";
import { formatDuration } from "../formatter/text.js";
import { icon } from "./icons.js";

/**
 * Staged progress tracker. In interactive terminals each completed stage is
 * printed as a checkmarked line with its elapsed time:
 *
 *   ✔ Loading config (2ms)
 *   ✔ Building dependency graph (118ms)
 *   ✔ Analyzing impact (1ms)
 *
 * Everywhere else (CI, pipes, JSON mode) it is a silent no-op.
 */

export interface StageTracker {
  /** Finish the previous stage (if any) and announce the next one. */
  next(label: string): void;
  /** Finish the current stage. */
  done(): void;
}

const noop: StageTracker = {
  next: () => {},
  done: () => {},
};

export function createStageTracker(enabled: boolean): StageTracker {
  if (!enabled || !process.stdout.isTTY) return noop;

  let current: string | undefined;
  let from = 0;

  const stamp = (label: string, ms: number): void => {
    process.stdout.write(
      `${chalk.green(icon("tick"))} ${label} ${chalk.dim(formatDuration(ms))}\n`,
    );
  };

  return {
    next(label: string): void {
      if (current) stamp(current, Date.now() - from);
      current = label;
      from = Date.now();
    },
    done(): void {
      if (current) stamp(current, Date.now() - from);
      current = undefined;
    },
  };
}
