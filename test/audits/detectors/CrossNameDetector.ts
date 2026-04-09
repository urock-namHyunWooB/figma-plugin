import type { InternalNode } from "@code-generator2/types/types";
import type { AnomalyDetector, Anomaly, AnomalyContext } from "./types";

/**
 * mergedNodes에 서로 다른 이름이 섞인 노드를 탐지.
 * variant root(depth 0)는 mergedNodes name이 variant property string이라 스킵.
 */
export class CrossNameDetector implements AnomalyDetector {
  readonly name = "cross-name";

  detect(
    node: InternalNode,
    depth: number,
    _ctx: AnomalyContext
  ): Omit<Anomaly, "fixture"> | null {
    if (depth < 1) return null;
    const merged = node.mergedNodes ?? [];
    if (merged.length < 2) return null;

    const nameCounts = new Map<string, number>();
    for (const m of merged) {
      nameCounts.set(m.name, (nameCounts.get(m.name) ?? 0) + 1);
    }
    if (nameCounts.size <= 1) return null;

    const sorted = [...nameCounts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    );
    const primaryName = sorted[0][0];
    const outliers = sorted.slice(1);

    return {
      detectorName: this.name,
      nodeId: node.id,
      primaryName,
      primaryType: node.type,
      payload: {
        mergedNodesCount: merged.length,
        outlierNames: outliers.map(([n, c]) => ({ name: n, count: c })),
        outlierMerged: merged
          .filter((m) => m.name !== primaryName)
          .map((m) => ({
            id: m.id,
            name: m.name,
            variantName: m.variantName,
          })),
      },
    };
  }
}
