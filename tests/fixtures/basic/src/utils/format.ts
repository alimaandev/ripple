export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function formatMoney(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
