import type { ElementBindingsMap, ElementBinding } from "../types";

/**
 * 바인딩 직렬화/역직렬화 유틸리티 (단순화)
 */

/**
 * ElementBindingsMap을 JSON으로 직렬화
 */
export function serializeBindings(bindings: ElementBindingsMap): string {
  return JSON.stringify(bindings, null, 2);
}

/**
 * JSON을 ElementBindingsMap으로 역직렬화
 */
export function deserializeBindings(json: string): ElementBindingsMap | null {
  try {
    return JSON.parse(json) as ElementBindingsMap;
  } catch {
    return null;
  }
}

/**
 * 요소가 prop에 연결되어 있는지 확인
 */
export function hasBinding(
  elementId: string,
  bindings: ElementBindingsMap
): boolean {
  return elementId in bindings && bindings[elementId].connectedPropName !== null;
}

/**
 * 요소에 연결된 prop 이름 가져오기
 */
export function getConnectedProp(
  elementId: string,
  bindings: ElementBindingsMap
): string | null {
  if (!bindings[elementId]) return null;
  return bindings[elementId].connectedPropName;
}

/**
 * 특정 prop에 연결된 요소 개수
 */
export function getElementsConnectedToProp(
  propName: string,
  bindings: ElementBindingsMap
): number {
  return Object.values(bindings).filter(
    (binding) => binding.connectedPropName === propName
  ).length;
}
