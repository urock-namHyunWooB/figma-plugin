import type { InternalNode } from "../../../../../../../types/types";
import type { MatchSignal, SignalResult, MatchContext } from "../MatchSignal";

/**
 * BooleanPositionSwap (구 VariantPropPosition)
 *
 * Switch/Toggle 노브 전용 신호.
 * boolean variant prop(Checked, Active 등)이 노브/인디케이터의 좌우 위치를
 * 결정하는 패턴을 감지. 위치는 다르지만 같은 노드 → decisive-match.
 *
 * 실제 발동 fixture: Switchswitch, Toggle, taptap-navigation (3개).
 * NP가 decisive-match를 주지 못하는 극단적 cx 이동(0.2↔0.8 등)에서만 유효.
 *
 * 판정 (모두 만족해야 fire):
 * 1. mergedNodes의 variantName 파싱 가능
 * 2. 두 prop 집합에서 정확히 하나의 prop 값이 다름
 * 3. 그 prop 값이 둘 다 boolean (True/False/true/false)
 * 4. 두 노드의 타입이 일치
 * 5. 두 노드의 절대 크기가 유사 (ratio ≤ 1.2)
 * 6. 두 노드의 정규화 cy 거의 같음 (|Δcy| < 0.05)
 * 7. cx는 명백히 다름 (|Δcx| > 0.1)
 * 8. 두 노드의 name이 일치
 * 9. 두 노드 자체의 자식 개수가 같음
 * 10. 두 직접 부모의 자식 개수가 같음
 */
const SIZE_SIMILARITY_RATIO = 1.2;
/** Position swap이 감지됐을 때 부여하는 고정 cost. 0이 아니라 0.05로 둬서
 *  동시에 여러 후보가 fire해도 Hungarian이 tie를 만들지 않게 한다. */
const VPP_MATCH_COST = 0.05;

export class BooleanPositionSwap implements MatchSignal {
  readonly name = "BooleanPositionSwap";

  evaluate(a: InternalNode, b: InternalNode, ctx: MatchContext): SignalResult {
    const mergedA = a.mergedNodes?.[0];
    const mergedB = b.mergedNodes?.[0];
    if (!mergedA || !mergedB) {
      return { kind: "neutral", reason: "missing mergedNodes" };
    }

    const vnA = mergedA.variantName;
    const vnB = mergedB.variantName;
    if (!vnA || !vnB) {
      return { kind: "neutral", reason: "missing variantName" };
    }

    const propsA = parseVariantProps(vnA);
    const propsB = parseVariantProps(vnB);
    if (!propsA || !propsB) {
      return { kind: "neutral", reason: "unparseable variantName" };
    }

    const allKeys = new Set([...propsA.keys(), ...propsB.keys()]);
    const diffKeys: string[] = [];
    for (const k of allKeys) {
      if (propsA.get(k) !== propsB.get(k)) diffKeys.push(k);
    }
    if (diffKeys.length !== 1) {
      return { kind: "neutral", reason: `${diffKeys.length} prop diffs (need exactly 1)` };
    }

    const diffKey = diffKeys[0];
    const vA = propsA.get(diffKey);
    const vB = propsB.get(diffKey);
    if (!isBooleanValue(vA) || !isBooleanValue(vB)) {
      return { kind: "neutral", reason: `diff prop ${diffKey} not boolean (${vA}/${vB})` };
    }

    // type 일치 확인 (TypeCompatibility가 먼저 veto 하지만 안전하게 재확인)
    if (a.type !== b.type) {
      return { kind: "neutral", reason: `type mismatch (${a.type}/${b.type})` };
    }

    // 절대 크기 유사성 확인 — 크기가 다르면 같은 노드일 가능성이 낮음
    const boxA = ctx.dataManager.getById(mergedA.id)?.node?.absoluteBoundingBox;
    const boxB = ctx.dataManager.getById(mergedB.id)?.node?.absoluteBoundingBox;
    if (boxA && boxB) {
      const minW = Math.min(boxA.width, boxB.width);
      const minH = Math.min(boxA.height, boxB.height);
      if (minW > 0 && minH > 0) {
        const wRatio = Math.max(boxA.width, boxB.width) / minW;
        const hRatio = Math.max(boxA.height, boxB.height) / minH;
        if (wRatio > SIZE_SIMILARITY_RATIO || hRatio > SIZE_SIMILARITY_RATIO) {
          return {
            kind: "neutral",
            reason: `size ratio too large (w=${wRatio.toFixed(2)}, h=${hRatio.toFixed(2)})`,
          };
        }
      }
    }

    // 위치 비교
    const posA = this.getNormalizedPos(a, ctx);
    const posB = this.getNormalizedPos(b, ctx);
    if (!posA || !posB) {
      return { kind: "neutral", reason: "cannot resolve normalized positions" };
    }

    const dcx = Math.abs(posA.cx - posB.cx);
    const dcy = Math.abs(posA.cy - posB.cy);
    if (dcy >= 0.05) {
      return { kind: "neutral", reason: `cy differs too much (${dcy.toFixed(3)})` };
    }
    if (dcx <= 0.1) {
      return { kind: "neutral", reason: `cx too similar (${dcx.toFixed(3)}), not a position swap` };
    }

    // name 일치 확인 — 다른 name을 가진 sibling(SegmentedControl Tab4 vs Tab5 같은)이
    // 우연히 prop 한 개 + cx 이동 조건을 만족해 잘못 매칭되는 것을 방지.
    // 같은 논리 노드는 variant 간에 같은 name을 가진다.
    if (a.name !== b.name) {
      return {
        kind: "neutral",
        reason: `name mismatch (${a.name} ≠ ${b.name}) — likely different siblings`,
      };
    }

    // 두 노드 자체의 원본 자식 개수가 같아야 함 — boolean variant가 자식 존재를
    // 토글하는 경우(SegmentedControl Icons frame: Icon=False에선 빈 frame, Icon=True에선 Icon
    // INSTANCE 포함)에 잘못된 매칭을 방지. origChildCount가 다르면 같은 논리 노드가 아님.
    const origA = ctx.dataManager.getById(mergedA.id)?.node as any;
    const origB = ctx.dataManager.getById(mergedB.id)?.node as any;
    const cntA = origA?.children?.length ?? 0;
    const cntB = origB?.children?.length ?? 0;
    if (cntA !== cntB) {
      return {
        kind: "neutral",
        reason: `child count differs (${cntA} vs ${cntB}) — variant toggles existence, not position`,
      };
    }

    // 두 직접 부모의 자식 개수가 같아야 함 — 부모도 같은 structural shape
    const parentA = this.getDirectParent(a, ctx);
    const parentB = this.getDirectParent(b, ctx);
    if (parentA && parentB) {
      const pChildrenA = (parentA as any).children as any[] | undefined;
      const pChildrenB = (parentB as any).children as any[] | undefined;
      if (pChildrenA && pChildrenB && pChildrenA.length !== pChildrenB.length) {
        return {
          kind: "neutral",
          reason: `parent child count differs (likely existence toggle, not position swap)`,
        };
      }
    }

    // decisive-match-with-cost: position-miss fallback 전용 fallback 매치.
    // cost를 작게 (0.05) 두어 NP success(0~0.1)보다 저렴하게 보이지만,
    // 여러 candidate가 동시에 fire할 때 Hungarian은 이미 다른 signal들의
    // 결과와 비교한 최적 매칭을 고름.
    // decisive-match(cost 0) 대신 with-cost(0.05)를 쓰면 후속 signal은 여전히
    // skip되지만, 엔진이 보는 totalCost는 0이 아닌 0.05가 되어 동급 cost끼리
    // 경쟁할 때 ties를 덜 만든다.
    return {
      kind: "decisive-match-with-cost",
      cost: VPP_MATCH_COST,
      reason: `${diffKey} boolean variant drives cx movement (${posA.cx.toFixed(2)} ↔ ${posB.cx.toFixed(2)})`,
    };
  }

  private getDirectParent(node: InternalNode, ctx: MatchContext): any | null {
    const mergedId = node.mergedNodes?.[0]?.id;
    if (!mergedId) return null;
    const variantRootId = ctx.nodeToVariantRoot.get(mergedId);
    if (!variantRootId) return null;
    const variantRoot = ctx.dataManager.getById(variantRootId)?.node;
    if (!variantRoot) return null;
    return findDirectParent(variantRoot as any, mergedId);
  }

  private getNormalizedPos(node: InternalNode, ctx: MatchContext): { cx: number; cy: number } | null {
    const mergedId = node.mergedNodes?.[0]?.id;
    if (!mergedId) return null;
    const variantRootId = ctx.nodeToVariantRoot.get(mergedId);
    if (!variantRootId) return null;
    const variantRoot = ctx.dataManager.getById(variantRootId)?.node;
    if (!variantRoot) return null;
    const orig = ctx.dataManager.getById(mergedId)?.node;
    if (!orig) return null;
    const parent = findDirectParent(variantRoot as any, mergedId);
    if (!parent) return null;
    const pos = ctx.layoutNormalizer.normalize(parent, orig as any);
    if (!pos) return null;
    // LayoutNormalizer는 relCenterX/relCenterY를 반환. cx/cy fallback도 지원하여
    // 테스트 mock (cx/cy) 양쪽에서 동작.
    const cx = (pos as any).relCenterX ?? (pos as any).cx;
    const cy = (pos as any).relCenterY ?? (pos as any).cy;
    if (typeof cx !== "number" || typeof cy !== "number") return null;
    return { cx, cy };
  }
}

function parseVariantProps(variantName: string): Map<string, string> | null {
  const map = new Map<string, string>();
  for (const part of variantName.split(",").map((s) => s.trim())) {
    const eq = part.indexOf("=");
    if (eq < 0) return null;
    map.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
  }
  return map.size > 0 ? map : null;
}

function isBooleanValue(v: string | undefined): boolean {
  return v === "True" || v === "False" || v === "true" || v === "false";
}

function findDirectParent(root: any, nodeId: string): any | null {
  if (!root?.children) return null;
  for (const child of root.children) {
    if (child.id === nodeId) return root;
    const r = findDirectParent(child, nodeId);
    if (r) return r;
  }
  return null;
}
