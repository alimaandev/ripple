/**
 * Turn a directory segment into a human-readable impact-area label:
 *
 * - `user-profile` → `User Profile`
 * - `userProfile` → `User Profile`
 * - `oauth` → `OAuth` (known acronyms use their canonical casing)
 * - `authentication` → `Authentication`
 */
const ACRONYM_CANONICAL: Record<string, string> = {
  api: "API",
  ui: "UI",
  ux: "UX",
  oauth: "OAuth",
  jwt: "JWT",
  http: "HTTP",
  https: "HTTPS",
  ws: "WS",
  sse: "SSE",
  db: "DB",
  sql: "SQL",
  id: "ID",
  cli: "CLI",
  ci: "CI",
  cd: "CD",
  csv: "CSV",
  json: "JSON",
  pdf: "PDF",
  cors: "CORS",
  url: "URL",
  uri: "URI",
  uuid: "UUID",
  html: "HTML",
  css: "CSS",
  js: "JS",
  ts: "TS",
  tsx: "TSX",
  jsx: "JSX",
  aws: "AWS",
  s3: "S3",
  sms: "SMS",
  mfa: "MFA",
  otp: "OTP",
  smtp: "SMTP",
  rss: "RSS",
};

function splitWords(segment: string): string[] {
  const normalized = segment.replace(/[^a-zA-Z0-9]+/g, " ");
  const matches = normalized.match(/[A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|[0-9]+/g);
  return (matches ?? [segment]).map((word) => word.toLowerCase());
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function humanizeArea(segment: string): string {
  const words = splitWords(segment);
  if (words.length === 0) return capitalize(segment);
  return words.map((word) => ACRONYM_CANONICAL[word] ?? capitalize(word)).join(" ");
}
