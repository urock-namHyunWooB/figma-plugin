/**
 * Props 관련 AST 생성
 */

import * as ts from "typescript";
import type { ComponentDSL } from "./types";

/**
 * Props Interface 생성
 */
export function createPropsInterface(
  componentName: string,
  propsDefinition: ComponentDSL["propsDefinition"],
): ts.InterfaceDeclaration {
  const members = propsDefinition.map((prop) => createPropertySignature(prop));

  return ts.factory.createInterfaceDeclaration(
    [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    `${componentName}Props`,
    undefined,
    undefined,
    members,
  );
}

/**
 * Property Signature 생성
 */
function createPropertySignature(
  prop: ComponentDSL["propsDefinition"][0],
): ts.PropertySignature {
  const type = mapPropTypeToTypeNode(prop);
  const questionToken =
    prop.required === false
      ? ts.factory.createToken(ts.SyntaxKind.QuestionToken)
      : undefined;

  return ts.factory.createPropertySignature(
    undefined,
    prop.name,
    questionToken,
    type,
  );
}

/**
 * Prop 타입을 TypeNode로 변환
 */
function mapPropTypeToTypeNode(
  prop: ComponentDSL["propsDefinition"][0],
): ts.TypeNode {
  // variantOptions가 있으면 유니온 타입
  if (prop.variantOptions && prop.variantOptions.length > 0) {
    const unionTypes = prop.variantOptions.map((option) =>
      ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral(option)),
    );
    return ts.factory.createUnionTypeNode(unionTypes);
  }

  // 기본 타입 매핑
  switch (prop.type) {
    case "string":
      return ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
    case "number":
      return ts.factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword);
    case "boolean":
      return ts.factory.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword);
    case "object":
      return ts.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword);
    case "array":
      return ts.factory.createArrayTypeNode(
        ts.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
      );
    default:
      return ts.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword);
  }
}
