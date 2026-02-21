/**
 * TEXT Slot 유틸리티
 *
 * TEXT 노드를 slot으로 변환하기 위한 휴리스틱 전용 유틸 함수들
 * 각 휴리스틱(Button, Input, Card 등)에서 컨텍스트에 맞게 사용 가능
 */

import type { InternalTree } from "../../../../types/types";
import type DataManager from "../../../data-manager/DataManager";

/**
 * TEXT 노드의 실제 텍스트 내용 추출
 *
 * @param nodeId - 노드 ID
 * @param dataManager - DataManager 인스턴스
 * @returns 텍스트 내용 (없으면 undefined)
 */
export function getTextCharacters(
  nodeId: string,
  dataManager: DataManager
): string | undefined {
  const { node } = dataManager.getById(nodeId);
  if (!node) return undefined;

  if ("characters" in node && typeof node.characters === "string") {
    return node.characters;
  }

  return undefined;
}

/**
 * 병합된 노드들의 텍스트 내용이 모두 동일한지 확인
 *
 * @param mergedNodes - 병합된 노드 배열
 * @param dataManager - DataManager 인스턴스
 * @returns 모두 동일하면 true
 */
export function areTextCharactersSame(
  mergedNodes: Array<{ id: string }>,
  dataManager: DataManager
): boolean {
  if (mergedNodes.length <= 1) return true;

  let firstCharacters: string | undefined;

  for (const merged of mergedNodes) {
    const characters = getTextCharacters(merged.id, dataManager);

    if (firstCharacters === undefined) {
      firstCharacters = characters;
    } else if (characters !== firstCharacters) {
      return false; // 다른 텍스트 발견
    }
  }

  return true; // 모두 동일
}

/**
 * TEXT가 일부 variant에만 존재하는지 확인
 *
 * @param mergedNodes - 병합된 노드 배열
 * @param totalVariantCount - 전체 variant 수
 * @returns 일부에만 존재하면 true
 */
export function isTextInSomeVariantsOnly(
  mergedNodes: Array<{ id: string }>,
  totalVariantCount: number
): boolean {
  return totalVariantCount > 0 && mergedNodes.length < totalVariantCount;
}

/**
 * TEXT가 variant마다 다른지 확인 (내용 또는 존재 여부)
 *
 * @param mergedNodes - 병합된 노드 배열
 * @param totalVariantCount - 전체 variant 수
 * @param dataManager - DataManager 인스턴스
 * @returns variant마다 다르면 true
 */
export function hasTextVariation(
  mergedNodes: Array<{ id: string }>,
  totalVariantCount: number,
  dataManager: DataManager
): boolean {
  // 조건 1: 일부 variant에만 존재
  if (isTextInSomeVariantsOnly(mergedNodes, totalVariantCount)) {
    return true;
  }

  // 조건 2: 모든 variant에 존재하지만 내용이 다름
  if (mergedNodes.length > 1) {
    return !areTextCharactersSame(mergedNodes, dataManager);
  }

  return false;
}

/**
 * TEXT 노드가 slot으로 변환되어야 하는지 판단
 *
 * 기본 규칙 (컨텍스트 무시):
 * - TEXT가 일부 variant에만 존재 → slot
 * - TEXT 내용이 variant마다 다름 → slot
 *
 * 각 휴리스틱에서 이 함수를 기반으로 추가 조건 적용 가능
 *
 * @param node - InternalTree 노드
 * @param totalVariantCount - 전체 variant 수
 * @param dataManager - DataManager 인스턴스
 * @returns slot으로 변환해야 하면 true
 */
export function shouldBeTextSlot(
  node: InternalTree,
  totalVariantCount: number,
  dataManager: DataManager
): boolean {
  // TEXT 노드가 아니면 false
  if (node.type !== "TEXT") return false;

  // mergedNodes가 없으면 단일 variant → slot 불필요
  if (!node.mergedNodes || node.mergedNodes.length === 0) return false;

  return hasTextVariation(node.mergedNodes, totalVariantCount, dataManager);
}

/**
 * TEXT slot의 기본값 추출 (첫 번째 variant의 텍스트)
 *
 * @param mergedNodes - 병합된 노드 배열
 * @param dataManager - DataManager 인스턴스
 * @returns 기본 텍스트 값 (없으면 빈 문자열)
 */
export function extractDefaultTextValue(
  mergedNodes: Array<{ id: string }>,
  dataManager: DataManager
): string {
  if (mergedNodes.length === 0) return "";

  const firstCharacters = getTextCharacters(mergedNodes[0].id, dataManager);
  return firstCharacters ?? "";
}

/**
 * TEXT slot prop 이름 생성
 *
 * 규칙:
 * - 노드 이름을 camelCase로 변환
 * - 이미 "text"로 끝나면 그대로, 아니면 "Text" 추가
 *
 * 예:
 * - "Title" → "titleText"
 * - "Button Text" → "buttonText"
 * - "text" → "text"
 *
 * @param nodeName - 노드 이름
 * @returns prop 이름
 */
export function generateTextSlotPropName(nodeName: string): string {
  // 간단한 camelCase 변환 (공백/특수문자 제거)
  const camelCase = nodeName
    .replace(/[^a-zA-Z0-9\s]/g, "") // 특수문자 제거
    .split(/\s+/) // 공백으로 분할
    .map((word, index) => {
      if (index === 0) {
        return word.charAt(0).toLowerCase() + word.slice(1);
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join("");

  // 이미 "text"로 끝나면 그대로 반환
  if (camelCase.toLowerCase().endsWith("text")) {
    return camelCase;
  }

  // 아니면 "Text" 추가
  return camelCase + "Text";
}

/**
 * TEXT 노드를 slot으로 변환하기 위한 정보 추출
 *
 * @param node - InternalTree 노드
 * @param totalVariantCount - 전체 variant 수
 * @param dataManager - DataManager 인스턴스
 * @returns slot 정보 (변환 불필요하면 null)
 */
export function extractTextSlotInfo(
  node: InternalTree,
  totalVariantCount: number,
  dataManager: DataManager
): {
  propName: string;
  defaultValue: string;
} | null {
  if (!shouldBeTextSlot(node, totalVariantCount, dataManager)) {
    return null;
  }

  const propName = generateTextSlotPropName(node.name);
  const defaultValue = extractDefaultTextValue(
    node.mergedNodes || [],
    dataManager
  );

  return { propName, defaultValue };
}
