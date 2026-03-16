/**
 * ConditionNode 유틸리티
 *
 * ConditionNode 트리에서 prop 정보를 추출하는 순수 유틸리티.
 * tree-manager와 code-emitter 양쪽에서 사용.
 */

import type { ConditionNode } from "./types";

export interface PropInfo {
  propName: string;
  propValue: string;
}

/**
 * ConditionNode에서 모든 prop 이름 추출.
 * truthy, not(truthy), eq, and 조건 모두 처리.
 */
export function extractAllPropNames(condition: ConditionNode): string[] {
  return extractAllPropInfos(condition).map((p) => p.propName);
}

/**
 * ConditionNode에서 모든 prop name+value 쌍 추출.
 * eq → propValue = value
 * truthy → propValue = "true"
 * not(truthy) → propValue = "false"
 */
export function extractAllPropInfos(condition: ConditionNode): PropInfo[] {
  if (condition.type === "eq" && (typeof condition.value === "string" || typeof condition.value === "boolean" || typeof condition.value === "number")) {
    return [{ propName: condition.prop, propValue: String(condition.value) }];
  }

  if (condition.type === "truthy") {
    return [{ propName: condition.prop, propValue: "true" }];
  }

  if (
    condition.type === "not" &&
    condition.condition.type === "truthy"
  ) {
    return [{ propName: condition.condition.prop, propValue: "false" }];
  }

  if (condition.type === "and") {
    const results: PropInfo[] = [];
    for (const sub of condition.conditions) {
      results.push(...extractAllPropInfos(sub));
    }
    return results;
  }

  return [];
}
