/**
 * Resolve whether terminal output should be styled. Honors the explicit
 * `--no-color` flag first, then the standard `NO_COLOR` environment
 * variable (https://no-color.org). Actual ANSI emission is left to chalk,
 * which further disables itself when the stream is not a TTY.
 */
export function resolveColor(requested: boolean | undefined): boolean {
  if (requested === false) return false;
  const noColor = process.env.NO_COLOR;
  return noColor === undefined || noColor === "";
}
