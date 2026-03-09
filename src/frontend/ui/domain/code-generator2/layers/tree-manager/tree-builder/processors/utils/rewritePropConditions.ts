/**
 * rewritePropConditions
 *
 * 제거된 variant prop의 조건 참조를 대체 ConditionNode로 치환하는 범용 유틸리티
 *
 * 사용 예:
 *   // "state" prop 제거 후, Checked→eq(type,"checked") / Indeterminate→eq(type,"indeterminate") 로 치환
 *   rewritePropConditions(tree, "state", {
 *     Checked: { type: "eq", prop: "type", value: "checked" },
 *     Indeterminate: { type: "eq", prop: "type", value: "indeterminate" },
 *   });
 *
 *   // boolean prop으로 치환하는 경우
 *   rewritePropConditions(tree, "state", {
 *     Checked: { type: "truthy", prop: "checked" },
 *   });
 *
 * conditionMap에 없는 값(예: "Unchecked")은 기본 상태로 간주 → 조건 제거
 */

import type { InternalNode, ConditionNode } from "../../../../types/types";

/**
 * 트리 전체의 visibleCondition에서 removedProp 참조를 대체 ConditionNode로 치환
 *
 * @param tree - InternalNode 트리 루트
 * @param removedProp - 제거된 prop 이름 (예: "state")
 * @param conditionMap - variant 값 → 대체 ConditionNode 매핑
 *                       매핑에 없는 값은 기본 상태로 간주하여 조건 제거
 */
export function rewritePropConditions(
  tree: InternalNode,
  removedProp: string,
  conditionMap: Record<string, ConditionNode>
): void {
  rewriteNode(tree, removedProp, conditionMap);
}

function rewriteNode(
  node: InternalNode,
  removedProp: string,
  conditionMap: Record<string, ConditionNode>
): void {
  if (node.visibleCondition) {
    const rewritten = rewriteCondition(node.visibleCondition, removedProp, conditionMap);
    if (rewritten) {
      node.visibleCondition = rewritten;
    } else {
      delete node.visibleCondition;
    }
  }

  for (const child of node.children || []) {
    rewriteNode(child, removedProp, conditionMap);
  }
}

function rewriteCondition(
  cond: ConditionNode,
  removedProp: string,
  conditionMap: Record<string, ConditionNode>
): ConditionNode | undefined {
  // prop === "Value" → conditionMap[value] or 제거
  if (cond.type === "eq" && cond.prop === removedProp) {
    return conditionMap[cond.value as string] ?? undefined;
  }

  // prop !== "Value" → not(conditionMap[value]) or 유지
  if (cond.type === "neq" && cond.prop === removedProp) {
    const targetCond = conditionMap[cond.value as string];
    return targetCond ? { type: "not", condition: targetCond } : undefined;
  }

  // and / or: 자식 재귀 치환
  if (cond.type === "and" || cond.type === "or") {
    const rewritten = cond.conditions
      .map((c) => rewriteCondition(c, removedProp, conditionMap))
      .filter((c): c is ConditionNode => c !== undefined);
    if (rewritten.length === 0) return undefined;
    if (rewritten.length === 1) return rewritten[0];
    return { type: cond.type, conditions: rewritten };
  }

  // not: 내부 재귀
  if (cond.type === "not") {
    const inner = rewriteCondition(cond.condition, removedProp, conditionMap);
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
 * 트리 전체의 styles.dynamic에서 removedProp 참조를 대체 ConditionNode로 치환
 */
export function rewriteStateDynamicStyles(
  tree: InternalNode,
  removedProp: string,
  conditionMap: Record<string, ConditionNode>
): void {
  rewriteDynamicWalk(tree, removedProp, conditionMap);
}

function rewriteDynamicWalk(
  node: InternalNode,
  removedProp: string,
  conditionMap: Record<string, ConditionNode>
): void {
  if (node.styles?.dynamic && node.styles.dynamic.length > 0) {
    rewriteDynamic(node, removedProp, conditionMap);
  }
  for (const child of node.children || []) {
    rewriteDynamicWalk(child, removedProp, conditionMap);
  }
}

function rewriteDynamic(
  node: InternalNode,
  removedProp: string,
  conditionMap: Record<string, ConditionNode>
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
  // conditionKey → { condition, items } 수집
  const conditionCollector = new Map<
    string,
    {
      condition: ConditionNode;
      items: Array<{ style: Record<string, string | number>; nonStateCondition: ConditionNode | null }>;
    }
  >();

  for (const group of groups.values()) {
    processStateGroup(group, conditionMap, baseAdditions, nonStateVaryingEntries, conditionCollector);
  }

  // 4. 조건부 엔트리 생성 (그룹 간 일관성 → 단일 엔트리, 아니면 비-state 조건 결합)
  const condEntries: DynEntry[] = [];
  for (const [, { condition: targetCond, items: collected }] of conditionCollector) {
    const firstStr = JSON.stringify(collected[0].style);
    const allConsistent = collected.every((c) => JSON.stringify(c.style) === firstStr);

    if (allConsistent && Object.keys(collected[0].style).length > 0) {
      condEntries.push({
        condition: targetCond,
        style: collected[0].style,
      });
    } else {
      for (const c of collected) {
        if (Object.keys(c.style).length === 0) continue;
        const cond: ConditionNode = c.nonStateCondition
          ? { type: "and", conditions: [targetCond, c.nonStateCondition] }
          : targetCond;
        condEntries.push({ condition: cond, style: c.style });
      }
    }
  }

  // 5. dynamic 교체 + base 병합
  node.styles!.dynamic = [...otherEntries, ...nonStateVaryingEntries, ...condEntries];

  if (Object.keys(baseAdditions).length > 0) {
    node.styles!.base = { ...node.styles!.base, ...baseAdditions };
  }
}

function processStateGroup(
  group: ParsedStateEntry[],
  conditionMap: Record<string, ConditionNode>,
  baseAdditions: Record<string, string | number>,
  nonStateVaryingEntries: DynEntry[],
  conditionCollector: Map<
    string,
    {
      condition: ConditionNode;
      items: Array<{ style: Record<string, string | number>; nonStateCondition: ConditionNode | null }>;
    }
  >
): void {
  // a. default 찾기 (conditionMap에 없는 값 = 기본 상태)
  const defaultEntry = group.find((e) => !(e.stateValue in conditionMap));
  const nonDefaultEntries = group.filter((e) => e.stateValue in conditionMap);

  if (!defaultEntry) {
    // default 없음 → 모든 엔트리를 대체 조건으로 변환
    for (const entry of group) {
      const targetCond = conditionMap[entry.stateValue];
      if (!targetCond) continue;
      const condKey = JSON.stringify(targetCond);
      if (!conditionCollector.has(condKey)) {
        conditionCollector.set(condKey, { condition: targetCond, items: [] });
      }
      conditionCollector.get(condKey)!.items.push({
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

  // d. non-default → 대체 조건 수집 (state-varying CSS만)
  for (const nd of nonDefaultEntries) {
    const targetCond = conditionMap[nd.stateValue];
    if (!targetCond) continue;

    const style: Record<string, string | number> = {};
    for (const key of stateVaryingKeys) {
      if (key in nd.style) {
        style[key] = nd.style[key];
      }
    }

    const condKey = JSON.stringify(targetCond);
    if (!conditionCollector.has(condKey)) {
      conditionCollector.set(condKey, { condition: targetCond, items: [] });
    }
    conditionCollector.get(condKey)!.items.push({
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
