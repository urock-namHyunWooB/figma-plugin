/**
 * Override 유틸리티
 *
 * INSTANCE 노드의 override 비교를 위한 공통 유틸 함수
 */

import type { InternalTree } from "../../../../types/types";
import type DataManager from "../../../data-manager/DataManager";

/**
 * 인스턴스들이 서로 다른 override 값을 가지는지 확인
 *
 * 인스턴스들이 fills, characters 등의 override를 가지고
 * 그 값들이 서로 다르면 Array Slot으로 그룹화하지 않음
 * (개별 컴포넌트 호출로 override props를 전달해야 함)
 */
export function hasDistinctOverrides(
  nodes: InternalTree[],
  dataManager: DataManager
): boolean {
  // 각 노드의 override 값 수집
  const overrideValues: Array<{ fills: string; characters: string }> = [];

  for (const node of nodes) {
    const { node: figmaNode } = dataManager.getById(node.id);
    if (!figmaNode) continue;

    const instanceNode = figmaNode as any;

    // fills와 characters 값을 수집
    let fillsValue = "";
    let charactersValue = "";

    // children에서 fills/characters 추출
    if (instanceNode.children && Array.isArray(instanceNode.children)) {
      for (const child of instanceNode.children) {
        // fills (배경색)
        if (child.fills && Array.isArray(child.fills) && child.fills.length > 0) {
          const fill = child.fills[0];
          if (fill.type === "SOLID" && fill.color) {
            const { r, g, b } = fill.color;
            fillsValue += `${r},${g},${b};`;
          }
        }
        // characters (텍스트)
        if (child.characters !== undefined && child.characters !== "") {
          charactersValue += `${child.characters};`;
        }
      }
    }

    overrideValues.push({ fills: fillsValue, characters: charactersValue });
  }

  // 최소 2개 이상의 노드가 필요
  if (overrideValues.length < 2) {
    return false;
  }

  // 모든 값이 동일한지 확인
  const firstFills = overrideValues[0].fills;
  const firstChars = overrideValues[0].characters;

  for (let i = 1; i < overrideValues.length; i++) {
    if (
      overrideValues[i].fills !== firstFills ||
      overrideValues[i].characters !== firstChars
    ) {
      // 서로 다른 override 값이 있음
      return true;
    }
  }

  return false;
}
