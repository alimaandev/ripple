import { Button } from "@/components";
import { formatMoney } from "../utils/format";

export default function HomePage(): string {
  return `${Button()} ${formatMoney(9.99)}`;
}
