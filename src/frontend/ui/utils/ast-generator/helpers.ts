/**
 * AST Generator 헬퍼 함수들
 */

import * as ts from "typescript";
import type { ComponentDSL } from "./types";

/**
 * 리터럴 노드 생성
 */
export function createLiteralNode(value: any): ts.Expression {
  if (typeof value === "string") {
    return ts.factory.createStringLiteral(value);
  } else if (typeof value === "number") {
    return ts.factory.createNumericLiteral(value.toString());
  } else if (typeof value === "boolean") {
    return value ? ts.factory.createTrue() : ts.factory.createFalse();
  } else if (value === null) {
    return ts.factory.createNull();
  } else {
    return ts.factory.createIdentifier("undefined");
  }
}

/**
 * 함수 파라미터 생성
 */
export function createFunctionParameters(
  componentName: string,
  propsDefinition?: ComponentDSL["propsDefinition"],
): ts.ParameterDeclaration[] {
  if (!propsDefinition || propsDefinition.length === 0) {
    return [];
  }

  // Destructuring 파라미터 생성
  const bindingElements = propsDefinition.map((prop) => {
    const bindingName = prop.name;
    const initializer =
      prop.defaultValue !== undefined
        ? createLiteralNode(prop.defaultValue)
        : undefined;

    return ts.factory.createBindingElement(
      undefined,
      undefined,
      bindingName,
      initializer,
    );
  });

  const bindingPattern = ts.factory.createObjectBindingPattern(bindingElements);
  const typeAnnotation = ts.factory.createTypeReferenceNode(
    `${componentName}Props`,
    undefined,
  );

  return [
    ts.factory.createParameterDeclaration(
      undefined,
      undefined,
      bindingPattern,
      undefined,
      typeAnnotation,
    ),
  ];
}
