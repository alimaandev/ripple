import { SESSION_TTL_MS } from "./shared/constants";

const helper = require("./legacy/helper");
const lazyFormat = import("./utils/format");

export function legacyBootstrap(): string {
  return `${SESSION_TTL_MS}${helper.legacyName}${lazyFormat ? "lazy" : ""}`;
}
