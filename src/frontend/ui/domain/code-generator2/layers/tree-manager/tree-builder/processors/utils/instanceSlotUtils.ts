/**
 * INSTANCE Slot 유틸리티
 *
 * INSTANCE 노드를 slot으로 변환하기 위한 휴리스틱 전용 유틸 함수들
 */

import type { InternalTree } from "../../../../types/types";
import type { ComponentPropertyDef } from "../../heuristics/IHeuristic";

/**
 * Boolean variant 감지 (True/False 옵션을 가진 VARIANT)
 *
 * @param propDefs - componentPropertyDefinitions
 * @returns boolean variant 목록 [{ name, defaultValue }]
 */
export function detectBooleanVariants(
  propDefs: Record<string, ComponentPropertyDef> | undefined
): Array<{ name: string; defaultValue: boolean }> {
  if (!propDefs) return [];

  const booleanVariants: Array<{ name: string; defaultValue: boolean }> = [];

  for (const [propName, propDef] of Object.entries(propDefs)) {
    if (propDef.type !== "VARIANT") continue;

    const options = propDef.variantOptions || [];
    const normalizedOptions = options.map((opt) => opt.toLowerCase());

    // True/False 옵션을 가진 VARIANT
    const hasTrue = normalizedOptions.includes("true");
    const hasFalse = normalizedOptions.includes("false");

    if (hasTrue && hasFalse && options.length === 2) {
      const defaultValue =
        propDef.defaultValue?.toString().toLowerCase() === "true";

      booleanVariants.push({
        name: propName,
        defaultValue,
      });
    }
  }

  return booleanVariants;
}

/**
 * INSTANCE가 slot으로 변환되어야 하는지 판단
 *
 * 조건:
 * 1. isExposedInstance: true (Figma에서 명시적으로 노출) → 무조건 slot
 * 2. 일부 variant에만 존재 → slot
 *
 * @param node - InternalTree 노드
 * @param totalVariantCount - 전체 variant 수
 * @param isExposedInstance - Figma isExposedInstance 플래그
 * @returns slot으로 변환해야 하면 true
 */
export function shouldBeInstanceSlot(
  node: InternalTree,
  totalVariantCount: number,
  isExposedInstance: boolean | undefined
): boolean {
  if (node.type !== "INSTANCE") return false;

  // 1. isExposedInstance: true → 무조건 slot
  if (isExposedInstance === true) {
    return true;
  }

  // 2. mergedNodes가 없으면 단일 variant → slot 아님
  if (!node.mergedNodes || node.mergedNodes.length === 0) return false;

  // 3. 일부 variant에만 존재하면 slot
  return node.mergedNodes.length < totalVariantCount;
}

/**
 * INSTANCE slot prop 이름 생성
 *
 * 규칙:
 * - 노드 이름을 camelCase로 변환
 * - "_" prefix 제거
 * - 특수문자 제거
 *
 * 예:
 * - "_Normal Responsive" → "normalResponsive"
 * - "Right Icon" → "rightIcon"
 *
 * @param nodeName - 노드 이름
 * @returns prop 이름
 */
export function generateInstanceSlotPropName(nodeName: string): string {
  // "_" prefix 제거
  const cleaned = nodeName.replace(/^_+/, "");

  // camelCase 변환
  const camelCase = cleaned
    .replace(/[^a-zA-Z0-9\s]/g, "") // 특수문자 제거
    .split(/\s+/) // 공백으로 분할
    .map((word, index) => {
      if (index === 0) {
        return word.charAt(0).toLowerCase() + word.slice(1);
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join("");

  return camelCase || "instance";
}

/**
 * Boolean variant에서 slot prop 이름 생성
 *
 * @param variantName - variant 이름 (예: "Right Icon")
 * @returns prop 이름 (예: "rightIcon")
 */
export function generateBooleanVariantSlotName(variantName: string): string {
  return generateInstanceSlotPropName(variantName);
}
