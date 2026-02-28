/**
 * BreakpointHeuristic
 *
 * Figma Breakpoint variant prop을 감지하고 CSS @media query로 변환한다.
 *
 * 인식 기준 (아래 중 하나 이상):
 *   - prop 이름에 breakpoint, device, screen, platform 등 포함
 *   - prop 값에 xs, sm, md, lg, xl, mobile, desktop, tablet 등 포함
 *
 * 변환 내용:
 *   1. styles.dynamic의 브레이크포인트 조건 → styles.mediaQueries
 *   2. visibleCondition의 브레이크포인트 조건 → 반대 방향 @media { display: none }
 *   3. breakpoint prop → props에서 제거
 *
 * 미디어 쿼리 매핑:
 *   - Mobile(xs-sm)  → @media (max-width: 767px)  [스타일 적용용]
 *   - Desktop(md-lg) → null (기본값, base CSS에 유지)
 *   - Desktop(xl)    → @media (min-width: 1280px) [스타일 적용용]
 *
 * 가시성 반전 매핑 (요소 숨김용):
 *   - 모바일 전용 요소 → @media (min-width: 1280px) { display: none }
 *   - 데스크탑 전용 요소 → @media (max-width: 767px) { display: none }
 */

import type { InternalTree, PropDefinition, ConditionNode } from "../../../../types/types";

// 브레이크포인트 prop 이름 패턴
const BP_NAME_RE = /breakpoint|device|screen|platform/i;

// 브레이크포인트 prop 값 패턴
const BP_VALUE_RE = /\b(xs|sm|md|lg|xl|mobile|desktop|tablet)\b/i;

// Figma 브레이크포인트 값 → 스타일 적용 @media 쿼리
const STYLE_QUERY_MAP: Record<string, string | null> = {
  "Mobile(xs-sm)": "(max-width: 767px)",
  "Desktop(md-lg)": null, // 기본값 — base CSS에 유지
  "Desktop(xl)": "(min-width: 1280px)",
};

/**
 * prop이 브레이크포인트 prop인지 판단
 */
function isBreakpointProp(prop: PropDefinition): boolean {
  if (prop.type !== "variant") return false;
  if (BP_NAME_RE.test(prop.name)) return true;
  if ("options" in prop && Array.isArray(prop.options)) {
    if (prop.options.some((v) => BP_VALUE_RE.test(v))) return true;
  }
  return false;
}

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
 * - 모바일 전용 → 큰 화면에서 숨김 (min-width)
 * - 데스크탑 전용 → 작은 화면에서 숨김 (max-width)
 */
function getHideQuery(value: string): string | null {
  if (/mobile|xs|sm/i.test(value)) return "(min-width: 1280px)";
  if (/desktop|md|lg|xl/i.test(value)) return "(max-width: 767px)";
  return null;
}

/**
 * 조건에서 브레이크포인트 prop을 추출하고 나머지 조건을 반환
 * - eq 단독: { bpValue, rest: null }
 * - and 포함: { bpValue, rest: 나머지 조건 }
 * - 브레이크포인트 없음: { bpValue: null, rest: 원본 조건 }
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
          // 비기본 브레이크포인트 → @media 블록
          mediaEntries.push({ query, style: entry.style });
        } else {
          // 기본 브레이크포인트(Desktop(md-lg)) → base CSS로 승격
          // (base에 아직 해당 속성이 없는 경우에만 병합)
          for (const [prop, value] of Object.entries(entry.style)) {
            if (!(prop in node.styles!.base)) {
              node.styles!.base[prop] = value;
            }
          }
        }
        // 어떤 경우든 dynamic에서 제거 (bp 조건 소멸)
      } else {
        // 브레이크포인트 아닌 조건 → dynamic 유지
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
      // 브레이크포인트 조건 제거, 나머지(state 등) 유지
      node.visibleCondition = rest !== null ? rest : undefined;
    }
  }

  // 3. children 재귀
  for (const child of node.children) {
    processNode(child, bpPropName);
  }
}

/**
 * BreakpointHeuristic
 *
 * TreeBuilder Step 5.5에서 실행 (컴포넌트 휴리스틱 이전)
 * 브레이크포인트 variant prop을 감지하고 @media query로 변환
 */
export class BreakpointHeuristic {
  /**
   * 브레이크포인트 variant prop을 감지하고 @media query로 변환
   * @param tree - InternalTree (in-place 수정)
   * @param props - PropDefinition 배열 (in-place 수정)
   */
  static run(tree: InternalTree, props: PropDefinition[]): void {
    const bpIdx = props.findIndex(isBreakpointProp);
    if (bpIdx === -1) return; // 브레이크포인트 prop 없음

    const bpProp = props[bpIdx];

    // 트리 전체 변환
    processNode(tree, bpProp.name);

    // 브레이크포인트 prop 제거
    props.splice(bpIdx, 1);
  }
}
