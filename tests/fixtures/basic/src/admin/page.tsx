import { loginAsAdmin } from "../authentication/login";

export default function AdminPage(): string {
  const user = loginAsAdmin("root");
  return `<div>${user.name}</div>`;
}
