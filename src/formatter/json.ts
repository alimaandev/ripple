/** Serialize a report object to pretty JSON. */
export function serializeJson(report: unknown): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
