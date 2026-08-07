import type { Cycle, DependencyGraph } from "../types/graph.js";

/**
 * Cycle detection via Kosaraju's strongly-connected-components algorithm,
 * implemented iteratively so deep import chains can never overflow the call
 * stack.
 *
 * Every SCC with more than one node (or a self-loop) is a circular
 * dependency group. For each group we additionally walk one representative
 * cycle path so output shows the *actual import chain*, not just the member
 * set.
 *
 * Ripple reports cycle *groups*: two files in the same SCC are reported once,
 * not once per back edge.
 */

/** Find SCCs in `graph`. Returns groups of node keys. */
export function findCycles(graph: DependencyGraph): Cycle[] {
  const nodeKeys = [...graph.nodes.keys()];

  // Pass 1: finish order via iterative DFS on the forward graph.
  const visited = new Set<string>();
  const finishOrder: string[] = [];

  for (const start of nodeKeys) {
    if (visited.has(start)) continue;
    const stack: Array<[node: string, neighborIndex: number]> = [[start, 0]];
    visited.add(start);

    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      if (top === undefined) break;
      const [node, index] = top;
      const neighbors = [...(graph.forward.get(node) ?? [])];

      if (index < neighbors.length) {
        top[1] = index + 1;
        const neighbor = neighbors[index];
        if (neighbor === undefined) continue;
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          stack.push([neighbor, 0]);
        }
      } else {
        stack.pop();
        finishOrder.push(node);
      }
    }
  }

  // Pass 2: process in reverse finish order on the reverse graph.
  const componentOf = new Map<string, number>();
  const components: string[][] = [];

  for (let i = finishOrder.length - 1; i >= 0; i--) {
    const start = finishOrder[i];
    if (start === undefined || componentOf.has(start)) continue;

    const component: string[] = [];
    const stack = [start];
    componentOf.set(start, components.length);

    while (stack.length > 0) {
      const node = stack.pop();
      if (node === undefined) continue;
      component.push(node);
      for (const neighbor of graph.reverse.get(node) ?? []) {
        if (!componentOf.has(neighbor)) {
          componentOf.set(neighbor, components.length);
          stack.push(neighbor);
        }
      }
    }

    components.push(component);
  }

  const cycles: Cycle[] = [];
  for (const component of components) {
    if (component.length < 2) {
      const single = component[0];
      if (single !== undefined && graph.forward.get(single)?.has(single)) {
        cycles.push({ members: [single], path: [single, single] });
      }
      continue;
    }

    const members = [...component].sort();
    const componentSet = new Set(component);
    const path = representativeCyclePath(graph, component, componentSet);
    cycles.push({ members, path: path ?? [members[0]!, members[0]!] });
  }

  cycles.sort(
    (a, b) => a.members.length - b.members.length || a.members[0]!.localeCompare(b.members[0]!),
  );
  return cycles;
}

/**
 * Walk forward edges within the component until a node is revisited; the
 * segment from the first occurrence forms a cycle path (start == end).
 */
function representativeCyclePath(
  graph: DependencyGraph,
  component: string[],
  componentSet: Set<string>,
): string[] | undefined {
  const inPath = new Set<string>();
  const path: string[] = [];
  let current: string | undefined = component[0];

  for (let steps = 0; steps <= component.length * 2 && current !== undefined; steps++) {
    const firstOccurrence = inPath.has(current);
    if (firstOccurrence) {
      const start = path.indexOf(current);
      if (start === -1) return undefined;
      const cycle = path.slice(start);
      if (cycle.length > 1 || graph.forward.get(current)?.has(current)) {
        cycle.push(current);
        return cycle;
      }
      return undefined;
    }
    inPath.add(current);
    path.push(current);

    const next = [...(graph.forward.get(current) ?? [])].find((candidate) =>
      componentSet.has(candidate),
    );
    current = next;
  }

  return undefined;
}
