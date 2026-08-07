export type Role = "user" | "admin" | "guest";

export interface Paginated<T> {
  items: T[];
  nextCursor?: string;
}
