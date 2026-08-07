import { CYCLE_MARKER_A } from "./a";
import { CYCLE_MARKER_C } from "./c";

export const CYCLE_MARKER_B = "b";

export function cycleB(): string {
  return CYCLE_MARKER_A + CYCLE_MARKER_C;
}
