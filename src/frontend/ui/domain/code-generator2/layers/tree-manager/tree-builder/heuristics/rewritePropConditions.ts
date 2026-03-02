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
