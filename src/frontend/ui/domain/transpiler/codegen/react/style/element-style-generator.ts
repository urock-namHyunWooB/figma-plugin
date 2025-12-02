import ts from "typescript";
import type { UnifiedNode } from "../../../types";
import { convertStyleToExpression } from "./style-converter";

/**
 * 자식 요소들의 스타일 상수 생성
 * 각 요소의 ID를 키로 사용하여 스타일 상수를 생성
 */
export function createElementStyleConstants(
  factory: ts.NodeFactory,
  rootNode: UnifiedNode
): ts.VariableStatement[] {
  const statements: ts.VariableStatement[] = [];
  const elementStyles = new Map<string, Record<string, any>>();

  // UnifiedNode 순회 함수 정의
  function traverseUnified(node: UnifiedNode) {
    // 루트 노드는 제외 (variant style로 처리되므로)
    if (node.id !== rootNode.id) {
      // UnifiedNode에는 styles 속성이 없으므로, props나 다른 곳에서 가져와야 함.
      // 현재 타입 정의상 styles가 없으므로, any로 캐스팅하여 확인하거나
      // 로직을 보완해야 함. 여기서는 일단 any로 캐스팅하여 styles가 혹시 있는지 확인.
      const nodeAny = node as any;
      if (nodeAny.styles && Object.keys(nodeAny.styles).length > 0) {
        elementStyles.set(node.id, nodeAny.styles);
      }
    }

    if (node.children) {
      node.children.forEach(traverseUnified);
    }
  }

  // AST를 순회하면서 모든 요소의 스타일 수집 (루트 제외)
  traverseUnified(rootNode);

  // styles 객체를 항상 생성 (사용되지 않아도 빈 객체라도 생성)
  // JSX에서 styles를 참조할 수 있으므로 항상 정의되어 있어야 함
  const styleProperties: ts.PropertyAssignment[] = [];
  for (const [elementId, style] of elementStyles.entries()) {
    // 요소 ID를 스타일 키로 변환 (특수 문자 제거)
    const styleKey = generateStyleKey(elementId);
    const styleExpression = convertStyleToExpression(factory, style);
    const cssCall = createCssCall(
      factory,
      styleExpression as ts.ObjectLiteralExpression
    );

    styleProperties.push(factory.createPropertyAssignment(styleKey, cssCall));
  }

  // 빈 객체라도 styles 상수를 생성 (JSX에서 참조할 수 있으므로)
  const stylesObject = factory.createObjectLiteralExpression(
    styleProperties,
    true
  );

  const stylesConstant = factory.createVariableStatement(
    undefined,
    factory.createVariableDeclarationList(
      [
        factory.createVariableDeclaration(
          factory.createIdentifier("styles"),
          undefined,
          undefined,
          stylesObject
        ),
      ],
      ts.NodeFlags.Const
    )
  );

  statements.push(stylesConstant);

  return statements;
}

/**
 * 요소 ID를 스타일 키로 변환
 * 특수 문자를 제거하고 유효한 식별자로 변환
 * 숫자로 시작하는 경우 앞에 언더스코어 추가
 */
function generateStyleKey(elementId: string): string {
  // 특수 문자를 언더스코어로 변환
  let key = elementId.replace(/[^a-zA-Z0-9]/g, "_");

  // 숫자로 시작하는 경우 앞에 언더스코어 추가
  if (/^\d/.test(key)) {
    key = `_${key}`;
  }

  return key;
}

/**
 * 요소 ID로 스타일 키 가져오기
 */
export function getStyleKeyForElement(elementId: string): string {
  return generateStyleKey(elementId);
}

// Helper: css(...) 함수 호출 표현식 생성
function createCssCall(
  factory: ts.NodeFactory,
  objectLiteral: ts.ObjectLiteralExpression
): ts.CallExpression {
  return factory.createCallExpression(
    factory.createIdentifier("css"),
    undefined,
    [objectLiteral]
  );
}
