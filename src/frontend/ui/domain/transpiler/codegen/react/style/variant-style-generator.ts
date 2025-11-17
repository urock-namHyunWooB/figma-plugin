import ts from "typescript";
import type { PropIR, VariantStyleIR } from "../../../types/props";
import { convertStyleToExpression } from "./style-converter";

/**
 * Variant style 생성 관련 함수
 */

/**
 * Variant style 상수 생성
 * baseStyle과 dimension별 스타일 맵을 생성
 */
export function createVariantStyleConstants(
  factory: ts.NodeFactory,
  propsIR: PropIR[],
  variantStyleMap: Map<string, VariantStyleIR>,
): ts.VariableStatement[] {
  const statements: ts.VariableStatement[] = [];

  // VARIANT 타입인 prop들을 찾아서 처리
  const variantProps = propsIR.filter((prop) => prop.type === "VARIANT");

  if (variantProps.length === 0 || variantStyleMap.size === 0) {
    return statements;
  }

  // baseStyle 생성 (첫 번째 variant의 baseStyle 사용, 모든 variant가 같은 baseStyle을 공유한다고 가정)
  const firstVariantStyle = Array.from(variantStyleMap.values())[0];
  if (firstVariantStyle?.baseStyle) {
    const baseStyleConstant = factory.createVariableStatement(
      undefined,
      factory.createVariableDeclarationList(
        [
          factory.createVariableDeclaration(
            factory.createIdentifier("baseStyle"),
            undefined,
            undefined,
            convertStyleToExpression(factory, firstVariantStyle.baseStyle),
          ),
        ],
        ts.NodeFlags.Const,
      ),
    );
    statements.push(baseStyleConstant);
  }

  // 각 dimension별 스타일 맵 생성
  for (const variantProp of variantProps) {
    const variantStyle = variantStyleMap.get(variantProp.originalName);
    if (!variantStyle) continue;

    const propName = variantProp.normalizedName; // "size", "state" 등
    const mapName = `${propName}Styles`; // "sizeStyles", "stateStyles"

    // 각 옵션 값별 스타일 객체 생성
    const mapProperties: ts.PropertyAssignment[] = [];
    for (const [optionValue, deltaStyle] of Object.entries(
      variantStyle.variantStyles,
    )) {
      const key = factory.createStringLiteral(optionValue);
      const value = convertStyleToExpression(factory, deltaStyle);
      mapProperties.push(factory.createPropertyAssignment(key, value));
    }

    const styleMap = factory.createObjectLiteralExpression(mapProperties, true);

    const styleMapConstant = factory.createVariableStatement(
      undefined,
      factory.createVariableDeclarationList(
        [
          factory.createVariableDeclaration(
            factory.createIdentifier(mapName),
            undefined,
            undefined,
            styleMap,
          ),
        ],
        ts.NodeFlags.Const,
      ),
    );
    statements.push(styleMapConstant);
  }

  return statements;
}

/**
 * Variant style 속성 생성
 * style={{ ...baseStyle, ...sizeStyles[size], ...stateStyles[state] }} 형태로 생성
 */
export function createVariantStyleAttribute(
  factory: ts.NodeFactory,
  propsIR: PropIR[],
  variantStyleMap: Map<string, VariantStyleIR>,
): ts.JsxAttribute | null {
  // VARIANT 타입인 prop들을 찾기
  const variantProps = propsIR.filter((prop) => prop.type === "VARIANT");

  if (variantProps.length === 0 || variantStyleMap.size === 0) {
    return null;
  }

  const spreadElements: ts.SpreadAssignment[] = [];

  // baseStyle 추가
  spreadElements.push(
    factory.createSpreadAssignment(factory.createIdentifier("baseStyle")),
  );

  // 각 variant prop별로 스타일 맵 참조 추가
  for (const variantProp of variantProps) {
    const variantStyle = variantStyleMap.get(variantProp.originalName);
    if (!variantStyle) continue;

    const propName = variantProp.normalizedName; // "size", "state" 등
    const mapName = `${propName}Styles`; // "sizeStyles", "stateStyles"
    const propIdentifier = factory.createIdentifier(propName);

    // sizeStyles[size] 형태의 표현식 생성
    const styleMapAccess = factory.createElementAccessExpression(
      factory.createIdentifier(mapName),
      propIdentifier,
    );

    spreadElements.push(factory.createSpreadAssignment(styleMapAccess));
  }

  // 객체 리터럴로 감싸기: { ...baseStyle, ...sizeStyles[size], ...stateStyles[state] }
  const styleObject = factory.createObjectLiteralExpression(
    spreadElements,
    true,
  );

  return factory.createJsxAttribute(
    factory.createIdentifier("style"),
    factory.createJsxExpression(undefined, styleObject),
  );
}
