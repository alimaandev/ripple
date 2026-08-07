import type { ImpactSummary, TopImpactArea } from "../types/analysis.js";
import type { AffectedFile } from "../types/analysis.js";
import { firstSegment } from "../utils/paths.js";
import { humanizeArea } from "./humanize.js";

/**
 * Aggregate the affected-file map into an `ImpactSummary`: per-category
 * counters, max depth and top impact areas.
 *
 * A file matched by several categories counts once per category — counts
 * therefore do not sum to `affectedFiles`.
 */

const MAX_IMPACT_AREAS = 5;

export function buildSummary(
  affected: Map<string, AffectedFile>,
  srcRoot: string,
  confidence: number,
): ImpactSummary {
  let routes = 0;
  let tests = 0;
  let components = 0;
  let utilities = 0;
  let entries = 0;
  let maxDepth = 0;

  const areaCounts = new Map<string, number>();

  for (const file of affected.values()) {
    if (file.depth > maxDepth) maxDepth = file.depth;
    if (file.categories.includes("route")) routes++;
    if (file.categories.includes("test")) tests++;
    if (file.categories.includes("component")) components++;
    if (file.categories.includes("utility")) utilities++;
    if (file.categories.includes("entry")) entries++;

    const area = firstSegment(file.path, srcRoot);
    if (area) {
      areaCounts.set(area, (areaCounts.get(area) ?? 0) + 1);
    }
  }

  const topImpact: TopImpactArea[] = [...areaCounts.entries()]
    .map(([label, count]) => ({ label: humanizeArea(label), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, MAX_IMPACT_AREAS);

  return {
    affectedFiles: affected.size,
    routes,
    tests,
    components,
    utilities,
    entries,
    maxDepth,
    topImpact,
    confidence,
  };
}
