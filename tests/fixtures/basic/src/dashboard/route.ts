import { loginUser } from "../authentication/login";

export function GET(): string {
  const user = loginUser("api", "key");
  return user.token;
}
