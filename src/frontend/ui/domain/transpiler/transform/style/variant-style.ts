import type { LayoutTreeNode } from "@backend/managers/ComponentStructureManager";
import type { BaseStyleProperties } from "@backend/types/styles";
import type { ComponentSetNodeSpec } from "@backend/managers/SpecManager";
import type { VariantStyleIR } from "../../types/props";
import { figmaStyleToCss } from "@frontend/ui/domain/transpiler/transform/style/figmaStyleToCss";
import { styleConverter } from "./style-generator";

/**
 * LayoutTreeNode 또는 BaseStyleProperties를 CSS 스타일 객체로 변환 (prettify)
 * Figma node → StyleObject 변환 함수를 Variant에도 재사용
 */
export function prettifyNodeToStyle(
  node: LayoutTreeNode | BaseStyleProperties,
): Record<string, any> {
  // LayoutTreeNode인 경우 styleConverter 사용
  if ("id" in node && "width" in node && "height" in node) {
    return styleConverter.layoutNodeToStyle(node as LayoutTreeNode, "FRAME");
  }

  // BaseStyleProperties인 경우 figmaStyleToCss 사용
  return figmaStyleToCss(node as BaseStyleProperties);
}

/**
 * layoutTree 기준으로 baseStyle 생성
 */
export function createBaseStyle(
  layoutTree: LayoutTreeNode | null,
): Record<string, any> {
  if (!layoutTree) {
    return {};
  }

  return prettifyNodeToStyle(layoutTree);
}

/**
 * 두 스타일 객체를 비교하여 델타만 추출
 * baseStyle과 variantStyle의 차이만 반환
 */
export function diffStyle(
  baseStyle: Record<string, any>,
  variantStyle: Record<string, any>,
): Record<string, any> {
  const delta: Record<string, any> = {};

  // variantStyle에만 있는 속성 또는 값이 다른 속성만 추출
  for (const [key, value] of Object.entries(variantStyle)) {
    // baseStyle에 없거나 값이 다른 경우
    if (!(key in baseStyle) || !Object.is(baseStyle[key], value)) {
      delta[key] = value;
    }
  }

  return delta;
}

/**
 * VariantStyleIR 생성
 * variantPatterns를 처리하여 baseStyle과 각 옵션별 델타를 계산
 */
export function buildVariantStyleIR(
  variantPropName: string,
  variantPatterns: Record<string, unknown>,
  baseStyle: Record<string, any>,
): VariantStyleIR {
  const variantStyles: Record<string, Record<string, any>> = {};

  // 각 옵션 값별로 variantStyle 계산 및 델타 추출
  for (const [variantValue, pattern] of Object.entries(variantPatterns)) {
    // pattern은 BaseStyleProperties 형태의 객체
    const variantStyle = prettifyNodeToStyle(pattern as BaseStyleProperties);
    const delta = diffStyle(baseStyle, variantStyle);
    variantStyles[variantValue] = delta;
  }

  return {
    propName: variantPropName,
    baseStyle,
    variantStyles,
  };
}

/**
 * 모든 variant props에 대한 VariantStyleIR 맵 생성
 * spec의 variantPatterns를 처리하여 각 prop별 variant style을 생성
 */
export function buildVariantStylesForProps(
  spec: ComponentSetNodeSpec,
  baseStyle: Record<string, any>,
): Map<string, VariantStyleIR> {
  const variantStyleMap = new Map<string, VariantStyleIR>();

  if (!spec.variantPatterns) {
    return variantStyleMap;
  }

  // variantPatterns에서 각 prop별로 variant style 생성
  for (const [propName, variantPatterns] of Object.entries(
    spec.variantPatterns,
  )) {
    const variantStyle = buildVariantStyleIR(
      propName,
      variantPatterns as Record<string, unknown>,
      baseStyle,
    );
    variantStyleMap.set(propName, variantStyle);
  }

  return variantStyleMap;
}
