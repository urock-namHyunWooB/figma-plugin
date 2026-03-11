/**
 * ResponsiveProcessor
 *
 * 모듈 레벨 컴포넌트에서 breakpoint variant prop을 CSS @media query로 변환한다.
 *
 * BreakpointHeuristic에서 이관된 변환 로직:
 *   1. styles.dynamic의 브레이크포인트 조건 → styles.mediaQueries
 *   2. visibleCondition의 브레이크포인트 조건 → 반대 방향 @media { display: none }
 *   3. breakpoint prop → props에서 제거
 *
 * 미디어 쿼리 매핑:
 *   - Mobile(xs-sm)  → @media (max-width: 767px)
 *   - Desktop(md-lg) → null (기본값, base CSS에 유지)
 *   - Desktop(xl)    → @media (min-width: 1280px)
 */

import type { InternalTree, PropDefinition, ConditionNode } from "../../../../../types/types";

// Figma 브레이크포인트 값 → 스타일 적용 @media 쿼리
const STYLE_QUERY_MAP: Record<string, string | null> = {
  "Mobile(xs-sm)": "(max-width: 767px)",
  "Desktop(md-lg)": null, // 기본값 — base CSS에 유지
  "Desktop(xl)": "(min-width: 1280px)",
};

/**
 * Figma 브레이크포인트 값 → 스타일 적용 @media 쿼리
 * STYLE_QUERY_MAP에 없으면 패턴으로 폴백
 */
function getStyleQuery(value: string): string | null {
  if (value in STYLE_QUERY_MAP) return STYLE_QUERY_MAP[value];
  if (/mobile|xs|sm/i.test(value)) return "(max-width: 767px)";
  if (/xl/i.test(value)) return "(min-width: 1280px)";
  return null; // 기본값 취급
}

/**
 * 브레이크포인트 값 → 이 요소를 숨길 @media 쿼리 (반전)
 */
function getHideQuery(value: string): string | null {
  if (/mobile|xs|sm/i.test(value)) return "(min-width: 1280px)";
  if (/desktop|md|lg|xl/i.test(value)) return "(max-width: 767px)";
  return null;
}

/**
 * 조건에서 브레이크포인트 prop을 추출하고 나머지 조건을 반환
 */
function extractBpFromCondition(
  condition: ConditionNode,
  bpPropName: string
): { bpValue: string | null; rest: ConditionNode | null } {
  if (condition.type === "eq" && condition.prop === bpPropName) {
    return { bpValue: String(condition.value), rest: null };
  }

  if (condition.type === "and") {
    const bpIdx = condition.conditions.findIndex(
      (c) => c.type === "eq" && c.prop === bpPropName
    );
    if (bpIdx >= 0) {
      const bpValue = String(
        (condition.conditions[bpIdx] as { type: "eq"; prop: string; value: string }).value
      );
      const others = condition.conditions.filter((_, i) => i !== bpIdx);
      const rest: ConditionNode | null =
        others.length === 0
          ? null
          : others.length === 1
          ? others[0]
          : { type: "and", conditions: others };
      return { bpValue, rest };
    }
  }

  return { bpValue: null, rest: condition };
}

/**
 * 트리 노드를 재귀적으로 순회하여 브레이크포인트 변환 적용
 */
function processNode(node: InternalTree, bpPropName: string): void {
  // 1. styles.dynamic → styles.mediaQueries 변환
  if (node.styles?.dynamic && node.styles.dynamic.length > 0) {
    const remainingDynamic: typeof node.styles.dynamic = [];
    const mediaEntries: Array<{ query: string; style: Record<string, string | number> }> = [];

    for (const entry of node.styles.dynamic) {
      const { bpValue } = extractBpFromCondition(entry.condition, bpPropName);
      if (bpValue !== null) {
        const query = getStyleQuery(bpValue);
        if (query !== null) {
          mediaEntries.push({ query, style: entry.style });
        } else {
          // 기본 브레이크포인트 → base CSS로 승격
          for (const [prop, value] of Object.entries(entry.style)) {
            if (!(prop in node.styles!.base)) {
              node.styles!.base[prop] = value;
            }
          }
        }
      } else {
        remainingDynamic.push(entry);
      }
    }

    node.styles.dynamic = remainingDynamic;
    if (mediaEntries.length > 0) {
      node.styles.mediaQueries = [
        ...(node.styles.mediaQueries ?? []),
        ...mediaEntries,
      ];
    }
  }

  // 2. visibleCondition의 브레이크포인트 → display:none @media 변환
  if (node.visibleCondition) {
    const { bpValue, rest } = extractBpFromCondition(
      node.visibleCondition,
      bpPropName
    );
    if (bpValue !== null) {
      const hideQuery = getHideQuery(bpValue);
      if (hideQuery) {
        if (!node.styles) {
          node.styles = { base: {}, dynamic: [] };
        }
        node.styles.mediaQueries = [
          ...(node.styles.mediaQueries ?? []),
          { query: hideQuery, style: { display: "none" } },
        ];
      }
      node.visibleCondition = rest !== null ? rest : undefined;
    }
  }

  // 3. children 재귀
  for (const child of node.children) {
    processNode(child, bpPropName);
  }
}

/**
 * ResponsiveProcessor
 *
 * breakpoint prop을 감지하고 CSS @media query로 변환한다.
 * ModuleHeuristic이 모듈로 판별한 컴포넌트에 대해서만 실행된다.
 */
export class ResponsiveProcessor {
  /**
   * breakpoint prop을 @media query로 변환
   * @param tree - InternalTree (in-place 수정)
   * @param props - PropDefinition 배열 (in-place 수정)
   * @param bpPropIndex - breakpoint prop의 인덱스
   */
  static run(tree: InternalTree, props: PropDefinition[], bpPropIndex: number): void {
    const bpProp = props[bpPropIndex];

    // 트리 전체 변환
    processNode(tree, bpProp.name);

    // 브레이크포인트 prop 제거
    props.splice(bpPropIndex, 1);
  }
}
