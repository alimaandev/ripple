import { revokeSession } from "../../session/manager";

export function POST(): string {
  revokeSession({ id: "x", createdAt: new Date() });
  return "ok";
}
