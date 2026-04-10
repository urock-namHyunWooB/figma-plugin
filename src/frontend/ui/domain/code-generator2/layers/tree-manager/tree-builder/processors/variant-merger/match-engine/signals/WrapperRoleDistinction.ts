import type { InternalNode } from "../../../../../../../types/types";
import type { MatchSignal, SignalResult, MatchContext } from "../MatchSignal";

const CONTAINER_TYPES: ReadonlySet<string> = new Set(["GROUP", "FRAME"]);

/**
 * Wrapper 역할 구분 신호 (Phase 2d).
 *
 * 회귀 패턴 처리 (Tagreview Small wrapper):
 *   두 노드의 variant root 크기가 거의 같은데 자식 수/구조가 크게 다르면
 *   "같은 부모 안 다른 역할"로 판정 → veto. wrapper를 content와 잘못 병합하는
 *   것을 방지한다.
 *
 * 판정:
 * 1. 두 노드가 container(FRAME/GROUP)가 아니면 neutral passthrough
 * 2. 두 variant root 크기가 ratio > variantRootSimilarityRatio 이상 다름 → neutral
 * 3. 자식 수 비율이 childrenCountDiffRatio 이상 → veto (wrapper 보호)
 * 4. 그 외 → neutral
 */
export class WrapperRoleDistinction implements MatchSignal {
  readonly name = "WrapperRoleDistinction";

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
    if (minW <= 0) {
      return { kind: "neutral", reason: "zero variant root" };
    }
    const rootRatio = maxW / minW;
    if (rootRatio > ctx.policy.variantRootSimilarityRatio) {
      return { kind: "neutral", reason: "variant roots too different for wrapper analysis" };
    }

    const childA = (a.children ?? []).length;
    const childB = (b.children ?? []).length;
    if (childA === 0 && childB === 0) {
      return { kind: "neutral", reason: "both empty" };
    }
    const maxC = Math.max(childA, childB);
    const minC = Math.max(1, Math.min(childA, childB));
    const childRatio = maxC / minC;
    if (childRatio >= ctx.policy.childrenCountDiffRatio) {
      return {
        kind: "veto",
        reason: `children count mismatch: ${childA}↔${childB} (ratio ${childRatio.toFixed(1)} ≥ ${ctx.policy.childrenCountDiffRatio})`,
      };
    }
    return { kind: "neutral", reason: `children counts compatible: ${childA}↔${childB}` };
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
}
