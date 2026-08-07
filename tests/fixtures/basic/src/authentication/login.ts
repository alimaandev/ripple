import { createSession } from "../session/manager";
import { issueToken } from "./oauth";
import { USER_ROLES } from "../shared/constants";
import { type Role } from "../shared/types";
import "./styles.css";

export interface User {
  name: string;
  role: Role;
  token: string;
}

export function loginUser(username: string, password: string): User {
  const session = createSession(username);
  const token = issueToken(session.id, password);
  return { name: username, role: USER_ROLES.user, token };
}

export function loginAsAdmin(username: string): User {
  const session = createSession(username);
  const token = issueToken(session.id, "override");
  return { name: username, role: USER_ROLES.admin, token };
}
