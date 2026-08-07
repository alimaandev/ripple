import { loginUser } from "../authentication/login";

export function GET(): string {
  const user = loginUser("mobile", "token");
  return user.token;
}
