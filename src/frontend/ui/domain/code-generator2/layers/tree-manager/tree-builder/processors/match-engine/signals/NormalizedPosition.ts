import type { InternalNode } from "../../../../../../types/types";
import type { MatchSignal, SignalResult, MatchContext } from "../MatchSignal";

/**
 * 정규화된 위치 비교 신호.
 *
 * LayoutNormalizer를 통해 두 노드의 위치를 각 노드의 직접 부모 기준으로
 * 독립 정규화한 뒤 compare 값을 받는다. cost가 policy.normalizedPositionThreshold
 * 이하면 score로 변환 (score = 1 - cost/threshold), 초과하면 veto.
 *
 * reference 크기가 크게 다를 때를 위한 avgSize fallback은 기존 NodeMatcher 동작 그대로 재현.
 */
export class NormalizedPosition implements MatchSignal {
  readonly name = "NormalizedPosition";

  evaluate(a: InternalNode, b: InternalNode, ctx: MatchContext): SignalResult {
    const mergedA = a.mergedNodes?.[0];
    const mergedB = b.mergedNodes?.[0];
    if (!mergedA || !mergedB) {
      return { kind: "veto", reason: "missing mergedNodes" };
    }

    // 부모가 없으면 (루트) → 루트끼리는 score 1
    if (!a.parent && !b.parent) {
      return { kind: "score", score: 1, reason: "both root nodes" };
    }

    const parentA = this.findDirectParent(mergedA.id, ctx);
    const parentB = this.findDirectParent(mergedB.id, ctx);
    const origA = ctx.dataManager.getById(mergedA.id)?.node;
    const origB = ctx.dataManager.getById(mergedB.id)?.node;

    if (!parentA || !parentB || !origA || !origB) {
      return { kind: "veto", reason: "cannot resolve parent/original node" };
    }

    const posA = ctx.layoutNormalizer.normalize(parentA as any, origA as any);
    const posB = ctx.layoutNormalizer.normalize(parentB as any, origB as any);
    if (!posA || !posB) {
      return { kind: "veto", reason: "normalize failed" };
    }

    const primaryCost = ctx.layoutNormalizer.compare(posA, posB);
    let cost = primaryCost;
    if (primaryCost > ctx.policy.normalizedPositionThreshold) {
      // reference 크기가 많이 다르면 avgSize fallback
      const avgCost = ctx.layoutNormalizer.compareAvgSize(
        parentA as any,
        origA as any,
        parentB as any,
        origB as any,
      );
      cost = Math.min(primaryCost, avgCost);
    }

    if (cost > ctx.policy.normalizedPositionThreshold) {
      return {
        kind: "veto",
        reason: `position cost ${cost.toFixed(3)} > ${ctx.policy.normalizedPositionThreshold}`,
      };
    }

    const score = 1 - cost / ctx.policy.normalizedPositionThreshold;
    return {
      kind: "score",
      score: Math.max(0, Math.min(1, score)),
      reason: `pos cost ${cost.toFixed(3)} (threshold ${ctx.policy.normalizedPositionThreshold})`,
    };
  }

  /**
   * 원본 노드의 직접 부모 찾기. NodeMatcher의 findDirectParent를 그대로 재현.
   */
  private findDirectParent(nodeId: string, ctx: MatchContext): unknown | null {
    const variantRootId = ctx.nodeToVariantRoot.get(nodeId);
    if (!variantRootId) return null;
    const variantRoot = ctx.dataManager.getById(variantRootId)?.node;
    if (!variantRoot) return null;

    const find = (parent: any): any | null => {
      if (!parent?.children) return null;
      for (const child of parent.children) {
        if (child.id === nodeId) return parent;
        const result = find(child);
        if (result) return result;
      }
      return null;
    };
    return find(variantRoot);
  }
}
