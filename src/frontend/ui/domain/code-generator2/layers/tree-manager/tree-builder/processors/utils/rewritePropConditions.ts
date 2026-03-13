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

import type { InternalNode, ConditionNode, PseudoClass } from "../../../../types/types";

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

  if (Object.keys(nonStateVaryingStyle).length > 0) {
    if (defaultEntry.nonStateCondition) {
      nonStateVaryingEntries.push({
        condition: defaultEntry.nonStateCondition,
        style: nonStateVaryingStyle,
      });
    } else {
      // nonStateCondition 없음 → base에 병합
      Object.assign(baseAdditions, nonStateVaryingStyle);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// convertStateDynamicToPseudo
//
// styles.dynamic 내 state variant 조건을 CSS pseudo-class로 변환.
// heuristic이 state prop 제거 후 호출하여, state dynamic → pseudo 변환을 수행.
//
// 처리 흐름:
// 1. dynamic 엔트리에서 eq(removedProp, value) 추출
// 2. 비-state 조건 기준 그룹핑
// 3. 그룹별: default 상태의 state-varying CSS → base 병합,
//    non-default → pseudo[pseudoMap[value]] 엔트리 생성
// 4. 비-state-varying CSS는 state 조건 제거 후 dynamic 유지
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 트리 전체의 styles.dynamic에서 state 조건을 CSS pseudo-class로 변환
 */
export function convertStateDynamicToPseudo(
  tree: InternalNode,
  removedProp: string,
  pseudoMap: Record<string, PseudoClass>
): void {
  pseudoConvertWalk(tree, removedProp, pseudoMap);
}

function pseudoConvertWalk(
  node: InternalNode,
  removedProp: string,
  pseudoMap: Record<string, PseudoClass>
): void {
  if (node.styles?.dynamic && node.styles.dynamic.length > 0) {
    pseudoConvertNode(node, removedProp, pseudoMap);
  }
  for (const child of node.children || []) {
    pseudoConvertWalk(child, removedProp, pseudoMap);
  }
}

function pseudoConvertNode(
  node: InternalNode,
  removedProp: string,
  pseudoMap: Record<string, PseudoClass>
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

  // 2.5 compound-varying CSS 속성 감지
  // 같은 state 값이 여러 nonStateCondition 그룹에서 다른 CSS 값을 가지면 compound
  const compoundProps = new Set<string>();
  if (groups.size > 1) {
    const propStateValues = new Map<string, Map<string, Set<string>>>();
    for (const group of groups.values()) {
      for (const entry of group) {
        for (const [key, val] of Object.entries(entry.style)) {
          if (!propStateValues.has(key)) propStateValues.set(key, new Map());
          const stateMap = propStateValues.get(key)!;
          if (!stateMap.has(entry.stateValue)) stateMap.set(entry.stateValue, new Set());
          stateMap.get(entry.stateValue)!.add(String(val));
        }
      }
    }
    for (const [prop, stateMap] of propStateValues) {
      for (const [, values] of stateMap) {
        if (values.size > 1) {
          compoundProps.add(prop);
          break;
        }
      }
    }
  }

  // 3. 그룹별 처리
  const baseAdditions: Record<string, string | number> = {};
  const nonStateVaryingEntries: DynEntry[] = [];
  const pseudoAdditions: Map<PseudoClass, Record<string, string | number>> = new Map();
  const keptEntries: DynEntry[] = [];

  for (const group of groups.values()) {
    processPseudoGroup(group, pseudoMap, removedProp, baseAdditions, nonStateVaryingEntries, pseudoAdditions, keptEntries, compoundProps);
  }

  // 4. dynamic 교체 + base 병합 + pseudo 병합
  node.styles!.dynamic = [...otherEntries, ...nonStateVaryingEntries, ...keptEntries];

  if (Object.keys(baseAdditions).length > 0) {
    node.styles!.base = { ...node.styles!.base, ...baseAdditions };
  }

  if (pseudoAdditions.size > 0) {
    if (!node.styles!.pseudo) node.styles!.pseudo = {};
    for (const [pseudo, style] of pseudoAdditions) {
      node.styles!.pseudo[pseudo] = {
        ...(node.styles!.pseudo[pseudo] || {}),
        ...style,
      };
    }
  }
}

/** default 상태 이름 패턴 (base로 병합됨) */
const DEFAULT_STATE_NAMES = new Set([
  "default", "normal", "enabled", "rest", "idle",
]);

function processPseudoGroup(
  group: ParsedStateEntry[],
  pseudoMap: Record<string, PseudoClass>,
  removedProp: string,
  baseAdditions: Record<string, string | number>,
  nonStateVaryingEntries: DynEntry[],
  pseudoAdditions: Map<PseudoClass, Record<string, string | number>>,
  keptEntries: DynEntry[],
  compoundProps: Set<string>
): void {
  // a. 3가지로 분류:
  //    - pseudo: pseudoMap에 있는 값 (hover → :hover)
  //    - default: DEFAULT_STATE_NAMES에 있는 값 (default → base로 병합)
  //    - kept: 위 둘 다 아닌 값 (loading → dynamic에 유지)
  const pseudoEntries = group.filter((e) => e.stateValue in pseudoMap);
  const defaultEntry = group.find(
    (e) => !(e.stateValue in pseudoMap) && DEFAULT_STATE_NAMES.has(e.stateValue.toLowerCase())
  );
  const keptStateEntries = group.filter(
    (e) => !(e.stateValue in pseudoMap) && !DEFAULT_STATE_NAMES.has(e.stateValue.toLowerCase())
  );

  // kept entries → state 조건 유지한 채로 dynamic에 보존
  for (const entry of keptStateEntries) {
    const cond: ConditionNode = { type: "eq", prop: removedProp, value: entry.stateValue };
    const fullCond = entry.nonStateCondition
      ? { type: "and" as const, conditions: [cond, entry.nonStateCondition] }
      : cond;
    keptEntries.push({ condition: fullCond, style: entry.style });
  }

  if (pseudoEntries.length === 0) {
    if (defaultEntry && keptStateEntries.length > 0) {
      // kept entries(loading 등)가 존재 → default도 state 조건을 유지하여
      // decomposer의 compound 분해가 대칭적으로 작동하도록 보장.
      // (state 조건을 제거하면 3-prop vs 4-prop 비대칭 → compound 감지 실패)
      // non-state-varying CSS(font-size 등)는 decomposer의 removeUniformProperties가
      // state 차원에서 동일 값을 자동 제거하므로 중복 문제 없음.
      const cond: ConditionNode = { type: "eq", prop: removedProp, value: defaultEntry.stateValue };
      const fullCond = defaultEntry.nonStateCondition
        ? { type: "and" as const, conditions: [cond, defaultEntry.nonStateCondition] }
        : cond;
      keptEntries.push({ condition: fullCond, style: defaultEntry.style });
    } else if (defaultEntry && defaultEntry.nonStateCondition) {
      // kept entries 없음 → 기존 동작: 전체 스타일을 비-state 조건으로 보존
      nonStateVaryingEntries.push({
        condition: defaultEntry.nonStateCondition,
        style: defaultEntry.style,
      });
    }
    return;
  }

  if (!defaultEntry) {
    // default 없음 → pseudo 엔트리만 변환
    for (const entry of pseudoEntries) {
      const pseudo = pseudoMap[entry.stateValue];
      if (!pseudo) continue;
      const existing = pseudoAdditions.get(pseudo) || {};
      pseudoAdditions.set(pseudo, { ...existing, ...entry.style });
    }
    return;
  }

  // b. state-varying CSS 키 계산 (default vs pseudo)
  const stateVaryingKeys = new Set<string>();
  for (const pe of pseudoEntries) {
    for (const key of Object.keys(pe.style)) {
      if (defaultEntry.style[key] !== pe.style[key]) {
        stateVaryingKeys.add(key);
      }
    }
    for (const key of Object.keys(defaultEntry.style)) {
      if (!(key in pe.style)) {
        stateVaryingKeys.add(key);
      }
    }
  }

  // b-2. compound-varying keys: pseudo/base 대신 keptEntries로 보존
  const compoundVaryingKeys = new Set(
    [...stateVaryingKeys].filter(k => compoundProps.has(k))
  );

  if (compoundVaryingKeys.size > 0) {
    // default + pseudo entries → keptEntries (전체 스타일로 대칭 유지)
    if (defaultEntry) {
      const cond: ConditionNode = { type: "eq", prop: removedProp, value: defaultEntry.stateValue };
      const fullCond = defaultEntry.nonStateCondition
        ? { type: "and" as const, conditions: [cond, defaultEntry.nonStateCondition] }
        : cond;
      keptEntries.push({ condition: fullCond, style: { ...defaultEntry.style } });
    }
    for (const pe of pseudoEntries) {
      const cond: ConditionNode = { type: "eq", prop: removedProp, value: pe.stateValue };
      const fullCond = pe.nonStateCondition
        ? { type: "and" as const, conditions: [cond, pe.nonStateCondition] }
        : cond;
      keptEntries.push({ condition: fullCond, style: { ...pe.style } });
    }
  }

  // c. default의 state-varying CSS → base에 병합 (compound 제외)
  for (const key of stateVaryingKeys) {
    if (compoundVaryingKeys.has(key)) continue;
    if (key in defaultEntry.style) {
      baseAdditions[key] = defaultEntry.style[key];
    }
  }

  // d. pseudo 엔트리 → pseudo 스타일로 이동 (state-varying CSS만, compound 제외)
  for (const pe of pseudoEntries) {
    const pseudo = pseudoMap[pe.stateValue];
    if (!pseudo) continue;

    const style: Record<string, string | number> = {};
    for (const key of stateVaryingKeys) {
      if (compoundVaryingKeys.has(key)) continue;
      if (key in pe.style) {
        style[key] = pe.style[key];
      }
    }

    if (Object.keys(style).length > 0) {
      const existing = pseudoAdditions.get(pseudo) || {};
      pseudoAdditions.set(pseudo, { ...existing, ...style });
    }
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

// ─────────────────────────────────────────────────────────────────────────────
// renamePropInConditions
//
// 트리 전체의 조건(visibleCondition + styles.dynamic)에서
// 특정 prop 이름을 다른 이름으로 변경.
//
// 예: on/off → checked (boolean prop 리네임)
//     truthy(onOff) → truthy(checked)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 트리 전체에서 prop 이름 변경 (visibility + dynamic 조건 모두)
 */
export function renamePropInConditions(
  tree: InternalNode,
  oldProp: string,
  newProp: string
): void {
  renameWalk(tree, oldProp, newProp);
}

function renameWalk(
  node: InternalNode,
  oldProp: string,
  newProp: string
): void {
  if (node.visibleCondition) {
    renameInCondition(node.visibleCondition, oldProp, newProp);
  }
  if (node.styles?.dynamic) {
    for (const entry of node.styles.dynamic) {
      renameInCondition(entry.condition, oldProp, newProp);
    }
  }
  for (const child of node.children || []) {
    renameWalk(child, oldProp, newProp);
  }
}

function renameInCondition(
  cond: ConditionNode,
  oldProp: string,
  newProp: string
): void {
  if (
    (cond.type === "eq" || cond.type === "neq" || cond.type === "truthy") &&
    cond.prop === oldProp
  ) {
    (cond as any).prop = newProp;
  }
  if (cond.type === "and" || cond.type === "or") {
    for (const child of cond.conditions) {
      renameInCondition(child, oldProp, newProp);
    }
  }
  if (cond.type === "not") {
    renameInCondition(cond.condition, oldProp, newProp);
  }
}
