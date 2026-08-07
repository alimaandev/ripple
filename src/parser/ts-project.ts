import { Project, ts } from "ts-morph";

/**
 * Shared ts-morph `Project` factory.
 *
 * One project is created per analysis run and reused for every file:
 * ts-morph parses lazily per source file, so this keeps memory bounded while
 * avoiding per-file project overhead. Files are added individually — the
 * tsconfig is never auto-loaded, since Ripple controls discovery itself.
 */
export function createTsProject(): Project {
  return new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      allowJs: true,
      checkJs: false,
      jsx: ts.JsxEmit.Preserve,
      noEmit: true,
      target: ts.ScriptTarget.ESNext,
    },
  });
}
