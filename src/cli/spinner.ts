import ora from "ora";

/**
 * Spinner for long-running commands. Becomes a no-op when the stream is not
 * a TTY (CI, pipes, tests) or when output is JSON — never pollute machines.
 */
export function createSpinner(enabled: boolean): { start(text: string): void; stop(): void } {
  if (!enabled || !process.stdout.isTTY) {
    return { start: () => {}, stop: () => {} };
  }
  let instance: ReturnType<typeof ora> | undefined;
  return {
    start(text: string): void {
      instance = ora(text).start();
    },
    stop(): void {
      instance?.stop();
      instance = undefined;
    },
  };
}
