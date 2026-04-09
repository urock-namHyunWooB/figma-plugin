import type { InternalNode } from "../../../../../../types/types";
import type { MatchSignal, SignalResult, MatchContext } from "../MatchSignal";

const SHAPE_TYPES: ReadonlySet<string> = new Set([
  "RECTANGLE", "VECTOR", "ELLIPSE", "LINE", "STAR", "POLYGON", "BOOLEAN_OPERATION",
]);
const CONTAINER_TYPES: ReadonlySet<string> = new Set(["GROUP", "FRAME"]);

/**
 * 정규화된 위치 비교 신호 (Phase 2: legacy getPositionCost 위치 분기 전체 재현).
 *
 * legacy NodeMatcher.getPositionCost의 position-match 분기를 그대로 옮긴다:
 * 1. 두 노드의 직접 부모 기준 LayoutNormalizer.compare로 cost 계산
 * 2. cost > threshold면 avgSize fallback 시도
 * 3. cost가 여전히 threshold 초과면 → neutral (다른 fallback signal에 위임)
 * 4. cost ≤ threshold면 size check (기존 isSimilarSize)
 *    - shape pair나 cross-container는 size ratio 검증
 *    - ratio 위반 → veto
 * 5. overflow penalty 적용 (variant root 비슷할 때만)
 * 6. decisive-match-with-cost(posCost [+ 0.5])로 반환 — 후속 fallback signal 차단
 *
 * Mutually exclusive 보장: 이 signal이 success하면 TextSpecial/InstanceSpecial은 skip된다.
 */
export class NormalizedPosition implements MatchSignal {
  readonly name = "NormalizedPosition";

  evaluate(a: InternalNode, b: InternalNode, ctx: MatchContext): SignalResult {
    const mergedA = a.mergedNodes?.[0];
    const mergedB = b.mergedNodes?.[0];
    if (!mergedA || !mergedB) {
      return { kind: "neutral", reason: "missing mergedNodes" };
    }

    // 부모가 없으면 (루트) → 루트끼리는 cost 0 decisive match
    if (!a.parent && !b.parent) {
      return { kind: "decisive-match-with-cost", cost: 0, reason: "both root nodes" };
    }

    const parentA = this.findDirectParent(mergedA.id, ctx);
    const parentB = this.findDirectParent(mergedB.id, ctx);
    const origA = ctx.dataManager.getById(mergedA.id)?.node;
    const origB = ctx.dataManager.getById(mergedB.id)?.node;

    if (!parentA || !parentB || !origA || !origB) {
      return { kind: "neutral", reason: "cannot resolve parent/original node" };
    }

    const posA = ctx.layoutNormalizer.normalize(parentA as any, origA as any);
    const posB = ctx.layoutNormalizer.normalize(parentB as any, origB as any);
    if (!posA || !posB) {
      return { kind: "neutral", reason: "normalize failed" };
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
      // Position 매칭 실패 → fallback signals (Text/Instance Special)에 위임
      return {
        kind: "neutral",
        reason: `position cost ${cost.toFixed(3)} > ${ctx.policy.normalizedPositionThreshold} (fallback)`,
      };
    }

    // posCost ≤ threshold: size check
    if (SHAPE_TYPES.has(a.type) && SHAPE_TYPES.has(b.type)) {
      if (!this.isSimilarSize(a, b, ctx)) {
        return { kind: "veto", reason: "shape size mismatch" };
      }
    }
    if (a.type !== b.type && CONTAINER_TYPES.has(a.type) && CONTAINER_TYPES.has(b.type)) {
      if (!this.isSimilarSize(a, b, ctx)) {
        return { kind: "veto", reason: "container cross size mismatch" };
      }
    }

    // overflow penalty (variant root 비슷할 때만)
    let totalCost = cost;
    if (CONTAINER_TYPES.has(a.type) && CONTAINER_TYPES.has(b.type)) {
      const rootA = this.getVariantRootBounds(a, ctx);
      const rootB = this.getVariantRootBounds(b, ctx);
      const rootSimilar = rootA && rootB &&
        Math.max(rootA.width, rootB.width) / Math.min(rootA.width, rootB.width) <= ctx.policy.variantRootSimilarityRatio &&
        Math.max(rootA.height, rootB.height) / Math.min(rootA.height, rootB.height) <= ctx.policy.variantRootSimilarityRatio;
      if (rootSimilar) {
        const overA = this.isOverflow(a, ctx);
        const overB = this.isOverflow(b, ctx);
        if (overA !== overB) {
          totalCost += ctx.policy.overflowMismatchPenalty;
        }
      }
    }

    return {
      kind: "decisive-match-with-cost",
      cost: totalCost,
      reason: `pos cost ${cost.toFixed(3)}${totalCost !== cost ? ` + overflow ${ctx.policy.overflowMismatchPenalty}` : ""}`,
    };
  }

  private isSimilarSize(a: InternalNode, b: InternalNode, ctx: MatchContext): boolean {
    const mergedA = a.mergedNodes?.[0];
    const mergedB = b.mergedNodes?.[0];
    if (!mergedA || !mergedB) return true;
    const origA = ctx.dataManager.getById(mergedA.id)?.node as any;
    const origB = ctx.dataManager.getById(mergedB.id)?.node as any;
    const boxA = origA?.absoluteBoundingBox;
    const boxB = origB?.absoluteBoundingBox;
    if (!boxA || !boxB) return true;
    const minW = Math.min(boxA.width, boxB.width);
    const minH = Math.min(boxA.height, boxB.height);
    if (minW <= 0 || minH <= 0) return true;
    const wRatio = Math.max(boxA.width, boxB.width) / minW;
    const hRatio = Math.max(boxA.height, boxB.height) / minH;
    const maxRatio = ctx.policy.relativeSizeMaxRatio;
    return wRatio <= maxRatio && hRatio <= maxRatio;
  }

  private getVariantRootBounds(node: InternalNode, ctx: MatchContext): { width: number; height: number } | null {
    const mergedId = node.mergedNodes?.[0]?.id;
    if (!mergedId) return null;
    const rootId = ctx.nodeToVariantRoot.get(mergedId);
    if (!rootId) return null;
    const root = ctx.dataManager.getById(rootId)?.node as any;
    const bounds = root?.absoluteBoundingBox;
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null;
    return { width: bounds.width, height: bounds.height };
  }

  private isOverflow(node: InternalNode, ctx: MatchContext): boolean {
    const mergedId = node.mergedNodes?.[0]?.id;
    if (!mergedId) return false;
    const orig = ctx.dataManager.getById(mergedId)?.node as any;
    if (!orig?.absoluteBoundingBox) return false;
    const parent = this.findDirectParent(mergedId, ctx);
    if (!parent) return false;
    const pos = ctx.layoutNormalizer.normalize(parent as any, orig);
    if (!pos) return false;
    return pos.relWidth > 1 || pos.relHeight > 1;
  }

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
