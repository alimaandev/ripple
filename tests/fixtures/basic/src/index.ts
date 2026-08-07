import { loginUser } from "./authentication/login";
import { Button } from "@/components";
import { formatDate } from "./utils/format";

export function bootstrap(): string {
  const user = loginUser("admin", "secret");
  return Button.label + formatDate(new Date()) + user.name;
}
