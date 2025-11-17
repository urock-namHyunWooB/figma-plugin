import ts from "typescript";

/**
 * Binding 표현식 생성
 */

/**
 * Binding 표현식 생성
 * 함수 파라미터가 destructuring ({ size, leftIcon, ... }) 형태이므로
 * prop인 경우도 변수명을 직접 사용
 */
export function createBindingExpression(
  factory: ts.NodeFactory,
  sourceKind: "prop" | "state",
  sourceName: string
): ts.Expression {
  // 함수 파라미터가 destructuring 형태이므로 prop도 변수명 직접 사용
  return factory.createIdentifier(sourceName);
}

