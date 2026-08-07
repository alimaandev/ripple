/**
 * Simple aligned table rendering. Cells are padded to the widest cell in
 * their column; rows are joined with two spaces.
 */

export interface TableColumn {
  header: string;
  /** Right-align numeric-ish columns. */
  align?: "left" | "right";
}

export function renderTable(columns: TableColumn[], rows: string[][]): string {
  const widths = columns.map((column, index) => {
    const cells = [column.header, ...rows.map((row) => row[index] ?? "")];
    return Math.max(...cells.map((cell) => cell.length));
  });

  const pad = (value: string, index: number): string => {
    const width = widths[index] ?? value.length;
    return columns[index]?.align === "right" ? value.padStart(width) : value.padEnd(width);
  };

  const lines: string[] = [];
  lines.push(columns.map((column, index) => pad(column.header, index)).join("  "));
  for (const row of rows) {
    lines.push(row.map((cell, index) => pad(cell, index)).join("  "));
  }
  return lines.join("\n");
}

/**
 * Render a key-value block with aligned values:
 *
 *   Risk          HIGH
 *   Affected      7 files
 */
export function renderKeyValue(entries: Array<[string, string]>): string {
  const width = Math.max(...entries.map(([key]) => key.length));
  return entries.map(([key, value]) => `${key.padEnd(width)}  ${value}`).join("\n");
}
