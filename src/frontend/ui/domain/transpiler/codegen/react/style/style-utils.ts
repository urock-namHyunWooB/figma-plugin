import ts from "typescript";

/**
 * 스타일 유틸리티 함수
 */

/**
 * 스타일 값을 TypeScript Expression으로 변환
 */
export function convertStyleValueToExpression(
  factory: ts.NodeFactory,
  value: any
): ts.Expression {
  if (typeof value === "string") {
    return factory.createStringLiteral(value);
  }
  if (typeof value === "number") {
    return factory.createNumericLiteral(value);
  }
  if (typeof value === "boolean") {
    return value ? factory.createTrue() : factory.createFalse();
  }
  if (value === null || value === undefined) {
    return factory.createNull();
  }
  return factory.createIdentifier("undefined");
}

/**
 * Figma 전용 속성인지 확인
 * CSS로 변환할 수 없는 Figma 전용 속성들은 제외
 */
export function isFigmaOnlyProperty(key: string): boolean {
  const figmaOnlyKeys = [
    "visible",
    "fills_count",
    "strokes_count",
    "strokeGeometry_length",
    "layoutSizingVertical",
    "layoutSizingHorizontal",
    "layoutMode",
    "itemSpacing",
    "primaryAxisAlignItems",
    "counterAxisAlignItems",
    "fills", // fills는 복잡한 구조이므로 별도 처리 필요
    "strokes", // strokes도 복잡한 구조
  ];
  return figmaOnlyKeys.includes(key);
}

/**
 * Figma 속성명을 CSS 속성명으로 변환
 * 예: "cornerRadius" → "borderRadius"
 * 예: "paddingTop" → "paddingTop"
 */
export function convertToCssPropertyName(figmaKey: string): string {
  // 기본적인 변환 규칙
  const mapping: Record<string, string> = {
    cornerRadius: "borderRadius",
    // width, height, paddingTop 등은 그대로 사용
  };

  if (mapping[figmaKey]) {
    return mapping[figmaKey];
  }

  return figmaKey;
}

