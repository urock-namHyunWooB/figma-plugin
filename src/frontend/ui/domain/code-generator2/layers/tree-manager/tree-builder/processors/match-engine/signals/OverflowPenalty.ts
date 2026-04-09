import type { InternalNode } from "../../../../../../types/types";
import type { MatchSignal, SignalResult, MatchContext } from "../MatchSignal";

const CONTAINER_TYPES: ReadonlySet<string> = new Set(["GROUP", "FRAME"]);

/**
 * Overflow penalty 신호.
 *
 * 기존 NodeMatcher.getPositionCost의 overflow 보정 로직 이식.
 *
 * 판정:
 * - 두 노드 모두 CONTAINER_TYPES가 아님 → score 1 (신호 대상 외)
 * - 두 variant root 크기가 variantRootSimilarityRatio 안으로 비슷함
 * - 그런데 한쪽만 overflow(relWidth 또는 relHeight > 1) → score 감점
 * - 그 외 → score 1
 *
 * 감점량: policy.overflowMismatchPenalty (기존 0.5).
 */
export class OverflowPenalty implements MatchSignal {
  readonly name = "OverflowPenalty";

  evaluate(a: InternalNode, b: InternalNode, ctx: MatchContext): SignalResult {
    if (!CONTAINER_TYPES.has(a.type) || !CONTAINER_TYPES.has(b.type)) {
      return { kind: "neutral", reason: "non-container pair passthrough" };
    }

    const rootA = this.getVariantRootBounds(a, ctx);
    const rootB = this.getVariantRootBounds(b, ctx);
    if (!rootA || !rootB) {
      return { kind: "neutral", reason: "missing variant root bounds" };
    }

    const maxW = Math.max(rootA.width, rootB.width);
    const minW = Math.min(rootA.width, rootB.width);
    const maxH = Math.max(rootA.height, rootB.height);
    const minH = Math.min(rootA.height, rootB.height);
    if (minW <= 0 || minH <= 0) {
      return { kind: "neutral", reason: "zero variant root" };
    }
    const rootSimilar =
      maxW / minW <= ctx.policy.variantRootSimilarityRatio &&
      maxH / minH <= ctx.policy.variantRootSimilarityRatio;
    if (!rootSimilar) {
      return { kind: "neutral", reason: "variant roots too different" };
    }

    const overflowA = this.isOverflow(a, ctx);
    const overflowB = this.isOverflow(b, ctx);
    if (overflowA === overflowB) {
      return { kind: "neutral", reason: "same overflow state" };
    }

    // overflow mismatch → 추가 cost (legacy +0.5)
    return {
      kind: "match-with-cost",
      cost: ctx.policy.overflowMismatchPenalty,
      reason: `overflow mismatch: a=${overflowA} b=${overflowB}`,
    };
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
    const pos = ctx.layoutNormalizer.normalize(parent, orig);
    if (!pos) return false;
    return pos.relWidth > 1 || pos.relHeight > 1;
  }

  /**
   * 원본 노드의 직접 부모 찾기. 변형 루트부터 재귀로 탐색.
   * 못 찾으면 변형 루트 자체를 fallback 부모로 사용 (독립 정규화 컨텍스트 유지).
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
        const r = find(child);
        if (r) return r;
      }
      return null;
    };
    return find(variantRoot) ?? variantRoot;
  }
}
