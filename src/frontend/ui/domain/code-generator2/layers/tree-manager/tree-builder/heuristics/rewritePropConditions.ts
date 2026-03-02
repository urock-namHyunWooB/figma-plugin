/**
 * rewritePropConditions
 *
 * 제거된 variant prop의 조건 참조를 boolean prop으로 치환하는 범용 유틸리티
 *
 * 사용 예:
 *   // "state" prop 제거 후, Checked→checked / Indeterminate→indeterminate 로 치환
 *   rewritePropConditions(tree, "state", { Checked: "checked", Indeterminate: "indeterminate" });
 *
 * valueMap에 없는 값(예: "Unchecked")은 기본 상태로 간주 → 조건 제거
 */

import type { InternalNode, ConditionNode } from "../../../../types/types";

/**
 * 트리 전체의 visibleCondition에서 removedProp 참조를 boolean prop으로 치환
 *
 * @param tree - InternalNode 트리 루트
 * @param removedProp - 제거된 prop 이름 (예: "state")
 * @param valueMap - variant 값 → 대체 boolean prop 이름 매핑
 *                   매핑에 없는 값은 기본 상태로 간주하여 조건 제거
 */
export function rewritePropConditions(
  tree: InternalNode,
  removedProp: string,
  valueMap: Record<string, string>
): void {
  rewriteNode(tree, removedProp, valueMap);
}

function rewriteNode(
  node: InternalNode,
  removedProp: string,
  valueMap: Record<string, string>
): void {
  if (node.visibleCondition) {
    const rewritten = rewriteCondition(node.visibleCondition, removedProp, valueMap);
    if (rewritten) {
      node.visibleCondition = rewritten;
    } else {
      delete node.visibleCondition;
    }
  }

  for (const child of node.children || []) {
    rewriteNode(child, removedProp, valueMap);
  }
}

function rewriteCondition(
  cond: ConditionNode,
  removedProp: string,
  valueMap: Record<string, string>
): ConditionNode | undefined {
  // prop === "Value" → truthy(boolProp) or 제거
  if (cond.type === "eq" && cond.prop === removedProp) {
    const boolProp = valueMap[cond.value as string];
    return boolProp ? { type: "truthy", prop: boolProp } : undefined;
  }

  // prop !== "Value" → not(truthy(boolProp)) or 유지
  if (cond.type === "neq" && cond.prop === removedProp) {
    const boolProp = valueMap[cond.value as string];
    return boolProp
      ? { type: "not", condition: { type: "truthy", prop: boolProp } }
      : undefined;
  }

  // and / or: 자식 재귀 치환
  if (cond.type === "and" || cond.type === "or") {
    const rewritten = cond.conditions
      .map((c) => rewriteCondition(c, removedProp, valueMap))
      .filter((c): c is ConditionNode => c !== undefined);
    if (rewritten.length === 0) return undefined;
    if (rewritten.length === 1) return rewritten[0];
    return { type: cond.type, conditions: rewritten };
  }

  // not: 내부 재귀
  if (cond.type === "not") {
    const inner = rewriteCondition(cond.condition, removedProp, valueMap);
    if (!inner) return undefined;
    return { type: "not", condition: inner };
  }

  // 다른 prop 참조 → 그대로 유지
  return cond;
}

// ─────────────────────────────────────────────────────────────────────────────
// rewriteStateDynamicStyles
//
// styles.dynamic 내 제거된 variant prop(예: "state")의 eq 조건을
// boolean prop 기반 truthy 엔트리로 치환.
//
// 처리 흐름:
// 1. dynamic 엔트리에서 eq(removedProp, value) 추출
// 2. 비-state 조건 기준 그룹핑
// 3. 그룹별: default 상태의 state-varying CSS → base 병합,
//    non-default → truthy(boolProp) 엔트리 생성
// 4. 비-state-varying CSS는 state 조건 제거 후 유지
// ─────────────────────────────────────────────────────────────────────────────

type DynEntry = {
  condition: ConditionNode;
  style: Record<string, string | number>;
};

interface ParsedStateEntry {
  stateValue: string;
  style: Record<string, string | number>;
  nonStateCondition: ConditionNode | null;
}

/**
 * 트리 전체의 styles.dynamic에서 removedProp 참조를 boolean prop으로 치환
 */
export function rewriteStateDynamicStyles(
  tree: InternalNode,
  removedProp: string,
  valueMap: Record<string, string>
): void {
  rewriteDynamicWalk(tree, removedProp, valueMap);
}

function rewriteDynamicWalk(
  node: InternalNode,
  removedProp: string,
  valueMap: Record<string, string>
): void {
  if (node.styles?.dynamic && node.styles.dynamic.length > 0) {
    rewriteDynamic(node, removedProp, valueMap);
  }
  for (const child of node.children || []) {
    rewriteDynamicWalk(child, removedProp, valueMap);
  }
}

function rewriteDynamic(
  node: InternalNode,
  removedProp: string,
  valueMap: Record<string, string>
): void {
  const dynamic = node.styles!.dynamic;

  // 1. state 조건 유무로 분리
  const stateEntries: ParsedStateEntry[] = [];
  const otherEntries: DynEntry[] = [];

  for (const entry of dynamic) {
    const parsed = extractStateEq(entry.condition, removedProp);
    if (parsed) {
      stateEntries.push({
        stateValue: parsed.stateValue,
        style: { ...entry.style },
        nonStateCondition: parsed.remaining,
      });
    } else {
      otherEntries.push(entry);
    }
  }

  if (stateEntries.length === 0) return;

  // 2. 비-state 조건 기준 그룹핑
  const groups = new Map<string, ParsedStateEntry[]>();
  for (const entry of stateEntries) {
    const key = entry.nonStateCondition
      ? JSON.stringify(entry.nonStateCondition)
      : "__none__";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(entry);
  }

  // 3. 그룹별 처리
  const baseAdditions: Record<string, string | number> = {};
  const nonStateVaryingEntries: DynEntry[] = [];
  // boolProp → 그룹별 { style, nonStateCondition } 수집
  const truthyCollector = new Map<
    string,
    Array<{ style: Record<string, string | number>; nonStateCondition: ConditionNode | null }>
  >();

  for (const group of groups.values()) {
    processStateGroup(group, valueMap, baseAdditions, nonStateVaryingEntries, truthyCollector);
  }

  // 4. truthy 엔트리 생성 (그룹 간 일관성 → 단일 엔트리, 아니면 비-state 조건 결합)
  const truthyEntries: DynEntry[] = [];
  for (const [boolProp, collected] of truthyCollector) {
    const firstStr = JSON.stringify(collected[0].style);
    const allConsistent = collected.every((c) => JSON.stringify(c.style) === firstStr);

    if (allConsistent && Object.keys(collected[0].style).length > 0) {
      truthyEntries.push({
        condition: { type: "truthy", prop: boolProp },
        style: collected[0].style,
      });
    } else {
      for (const c of collected) {
        if (Object.keys(c.style).length === 0) continue;
        const cond: ConditionNode = c.nonStateCondition
          ? { type: "and", conditions: [{ type: "truthy", prop: boolProp }, c.nonStateCondition] }
          : { type: "truthy", prop: boolProp };
        truthyEntries.push({ condition: cond, style: c.style });
      }
    }
  }

  // 5. dynamic 교체 + base 병합
  node.styles!.dynamic = [...otherEntries, ...nonStateVaryingEntries, ...truthyEntries];

  if (Object.keys(baseAdditions).length > 0) {
    node.styles!.base = { ...node.styles!.base, ...baseAdditions };
  }
}

function processStateGroup(
  group: ParsedStateEntry[],
  valueMap: Record<string, string>,
  baseAdditions: Record<string, string | number>,
  nonStateVaryingEntries: DynEntry[],
  truthyCollector: Map<
    string,
    Array<{ style: Record<string, string | number>; nonStateCondition: ConditionNode | null }>
  >
): void {
  // a. default 찾기 (valueMap에 없는 값 = 기본 상태)
  const defaultEntry = group.find((e) => !(e.stateValue in valueMap));
  const nonDefaultEntries = group.filter((e) => e.stateValue in valueMap);

  if (!defaultEntry) {
    // default 없음 → 모든 엔트리를 truthy로 변환
    for (const entry of group) {
      const boolProp = valueMap[entry.stateValue];
      if (!boolProp) continue;
      if (!truthyCollector.has(boolProp)) truthyCollector.set(boolProp, []);
      truthyCollector.get(boolProp)!.push({
        style: entry.style,
        nonStateCondition: entry.nonStateCondition,
      });
    }
    return;
  }

  // b. state-varying CSS 키 계산
  const stateVaryingKeys = new Set<string>();
  for (const nd of nonDefaultEntries) {
    for (const key of Object.keys(nd.style)) {
      if (defaultEntry.style[key] !== nd.style[key]) {
        stateVaryingKeys.add(key);
      }
    }
    for (const key of Object.keys(defaultEntry.style)) {
      if (!(key in nd.style)) {
        stateVaryingKeys.add(key);
      }
    }
  }

  // c. default의 state-varying CSS → base에 병합
  for (const key of stateVaryingKeys) {
    if (key in defaultEntry.style) {
      baseAdditions[key] = defaultEntry.style[key];
    }
  }

  // d. non-default → truthy 수집 (state-varying CSS만)
  for (const nd of nonDefaultEntries) {
    const boolProp = valueMap[nd.stateValue];
    if (!boolProp) continue;

    const style: Record<string, string | number> = {};
    for (const key of stateVaryingKeys) {
      if (key in nd.style) {
        style[key] = nd.style[key];
      }
    }

    if (!truthyCollector.has(boolProp)) truthyCollector.set(boolProp, []);
    truthyCollector.get(boolProp)!.push({
      style,
      nonStateCondition: nd.nonStateCondition,
    });
  }

  // e. 비-state-varying CSS → state 조건 제거 후 유지 (그룹당 1개)
  const nonStateVaryingStyle: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(defaultEntry.style)) {
    if (!stateVaryingKeys.has(key)) {
      nonStateVaryingStyle[key] = value;
    }
  }

  if (Object.keys(nonStateVaryingStyle).length > 0 && defaultEntry.nonStateCondition) {
    nonStateVaryingEntries.push({
      condition: defaultEntry.nonStateCondition,
      style: nonStateVaryingStyle,
    });
  }
}

/**
 * 조건에서 eq(removedProp, value)를 추출하고 나머지 반환
 */
function extractStateEq(
  cond: ConditionNode,
  removedProp: string
): { stateValue: string; remaining: ConditionNode | null } | null {
  if (cond.type === "eq" && cond.prop === removedProp) {
    return { stateValue: String(cond.value), remaining: null };
  }

  if (cond.type === "and") {
    let stateValue: string | null = null;
    const rest: ConditionNode[] = [];

    for (const child of cond.conditions) {
      if (child.type === "eq" && child.prop === removedProp && stateValue === null) {
        stateValue = String(child.value);
      } else {
        rest.push(child);
      }
    }

    if (stateValue !== null) {
      const remaining =
        rest.length === 0
          ? null
          : rest.length === 1
            ? rest[0]
            : { type: "and" as const, conditions: rest };
      return { stateValue, remaining };
    }
  }

  return null;
}
