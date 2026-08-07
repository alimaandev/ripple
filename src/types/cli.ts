/**
 * Shared contracts between the CLI layer and the analysis pipeline.
 * Kept free of commander types so the pipeline stays testable in isolation.
 */

/** Parsed command-line options for `ripple analyze`. */
export interface AnalyzeOptions {
  json: boolean;
  verbose: boolean;
  /** Whether to emit ANSI colors. `false` when `--no-color` is passed. */
  color?: boolean;
  /** Cap on reverse traversal depth. `undefined` = unlimited. */
  depth?: number;
  /** Path to a config file. Overrides discovery. */
  config?: string;
}

/** Parsed command-line options for `ripple graph`. */
export interface GraphOptions {
  json: boolean;
  verbose: boolean;
  /** Whether to emit ANSI colors. `false` when `--no-color` is passed. */
  color?: boolean;
  /** Show the dependency tree of one file instead of project stats. */
  file?: string;
  /** Render dependents (reverse) instead of dependants (forward). */
  reverse: boolean;
  /** Cap on tree depth. */
  depth?: number;
  config?: string;
}

/** Parsed command-line options for `ripple doctor`. */
export interface DoctorOptions {
  verbose: boolean;
  /** Whether to emit ANSI colors. `false` when `--no-color` is passed. */
  color?: boolean;
  config?: string;
}

/** Parsed command-line options for `ripple init`. */
export interface InitOptions {
  force: boolean;
}

/** Process exit codes used across commands. */
export const ExitCode = {
  Success: 0,
  Failure: 1,
  NotFound: 2,
  InvalidConfig: 3,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

/**
 * Abstraction over the destination of rendered output. The real CLI writes to
 * stdout; tests inject an in-memory implementation.
 */
export interface OutputWriter {
  write(text: string): void;
  writeLine(text?: string): void;
}

/** Everything commands need injected; no globals anywhere. */
export interface CommandContext {
  writer: OutputWriter;
  /** Stream for error messages (stderr in the real CLI). */
  errorWriter: OutputWriter;
  cwd: string;
  version: string;
}
