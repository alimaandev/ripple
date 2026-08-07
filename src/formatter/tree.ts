import treeify from "treeify";
import type { TreeObject } from "treeify";

/**
 * Tree rendering on top of `treeify`:
 *
 *   ├─ src/index.ts
 *   │  └─ src/main.ts
 *
 * `treeify` is a tiny pure function (no ink, no DOM), which keeps this layer
 * trivially testable. Leaf values are empty strings; `showValues` is off.
 */

export interface TreeNode {
  label: string;
  children?: TreeNode[];
}

function toTreeify(node: TreeNode): string | TreeObject {
  if (!node.children || node.children.length === 0) return "";
  const branch: TreeObject = {};
  for (const child of node.children) {
    branch[child.label] = toTreeify(child);
  }
  return branch;
}

export function renderTree(nodes: TreeNode[]): string {
  if (nodes.length === 0) return "";
  const root: TreeObject = {};
  for (const node of nodes) {
    root[node.label] = toTreeify(node);
  }
  return treeify.asTree(root, false, false).trimEnd();
}
