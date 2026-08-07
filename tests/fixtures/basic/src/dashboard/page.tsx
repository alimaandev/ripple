import { loginAsAdmin } from "../authentication/login";
import { formatDate } from "../utils/format";

export default function DashboardPage(): string {
  const user = loginAsAdmin("root");
  return `<div>${user.name} on ${formatDate(new Date())}</div>`;
}
