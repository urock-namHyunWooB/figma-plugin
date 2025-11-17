import ts from "typescript";
import {
  convertStyleValueToExpression,
  convertToCssPropertyName,
  isFigmaOnlyProperty,
} from "./style-utils";

/**
 * 스타일 변환 관련 함수
 */

/**
 * 스타일 속성 하나를 PropertyAssignment로 변환
 */
export function createStyleProperty(
  factory: ts.NodeFactory,
  key: string,
  value: any
): ts.PropertyAssignment {
  const valueExpression = convertStyleValueToExpression(factory, value);
  return factory.createPropertyAssignment(
    factory.createIdentifier(key),
    valueExpression
  );
}

/**
 * 스타일 객체를 TypeScript 객체 리터럴 표현식으로 변환
 *
 * 변환 규칙:
 * - string → StringLiteral
 * - number → NumericLiteral
 * - 그 외 → null
 */
export function convertStyleToExpression(
  factory: ts.NodeFactory,
  style: Record<string, any>
): ts.ObjectLiteralExpression {
  const properties = Object.entries(style).map(([key, value]) =>
    createStyleProperty(factory, key, value)
  );

  return factory.createObjectLiteralExpression(properties, true);
}

/**
 * diff 객체를 TypeScript 스타일 객체로 변환
 * diff는 스타일 속성들을 담고 있으므로, 이를 객체 리터럴로 변환
 */
export function convertDiffToStyleObject(
  factory: ts.NodeFactory,
  diff: Record<string, any>
): ts.ObjectLiteralExpression {
  const properties = Object.entries(diff)
    .filter(([key, value]) => {
      // undefined나 null이 아닌 값만 포함
      if (value === null || value === undefined) {
        return false;
      }
      // Figma 전용 속성 제외
      if (isFigmaOnlyProperty(key)) {
        return false;
      }
      return true;
    })
    .map(([key, value]) => {
      // CSS 속성명으로 변환 (camelCase 유지)
      const cssKey = convertToCssPropertyName(key);
      return createStyleProperty(factory, cssKey, value);
    });

  return factory.createObjectLiteralExpression(properties, true);
}

