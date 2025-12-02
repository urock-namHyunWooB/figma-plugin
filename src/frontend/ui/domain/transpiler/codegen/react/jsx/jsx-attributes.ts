import ts from "typescript";

import { convertStyleToExpression } from "../style/style-converter";
import { createClassNameAttribute } from "../style/variant-style-generator";
import { getStyleKeyForElement } from "../style/element-style-generator";
import type { ElementASTNode, PropIR, VariantStyleIR } from "../../../types";

/**
 * JSX 속성 생성 관련 함수
 */

/**
 * 요소에 style 속성이 있는지 확인
 */
export function hasStyle(node: ElementASTNode): boolean {
  return !!(node.styles && Object.keys(node.styles).length > 0);
}

/**
 * className prop 생성: className={css({...})}
 * emotion의 css 함수를 사용하여 클래스 이름을 생성
 */
export function createStyleAttribute(
  factory: ts.NodeFactory,
  style: Record<string, any>
): ts.JsxAttribute {
  const styleExpression = convertStyleToExpression(factory, style);
  // className={css({...})} 형태로 생성
  const cssCall = factory.createCallExpression(
    factory.createIdentifier("css"),
    undefined,
    [styleExpression]
  );
  return factory.createJsxAttribute(
    factory.createIdentifier("className"),
    factory.createJsxExpression(undefined, cssCall)
  );
}

/**
 * JSX 속성 배열 생성 (현재는 style만 지원)
 * 루트 요소인 경우 variant style 머지 로직 적용
 */
export function buildJsxAttributes(
  factory: ts.NodeFactory,
  node: ElementASTNode,
  propsIR?: PropIR[],
  variantStyleMap?: Map<string, VariantStyleIR>,
  isRoot: boolean = false
): ts.JsxAttributes {
  const attributes: ts.JsxAttributeLike[] = [];

  // 루트 요소이고 variant style이 있는 경우 머지
  if (isRoot && propsIR && variantStyleMap) {
    const styleAttribute = createClassNameAttribute(
      factory,
      propsIR,
      variantStyleMap
    );
    if (styleAttribute) {
      attributes.push(styleAttribute);
    } else if (hasStyle(node) && node.styles) {
      // variant style이 없으면 일반 스타일 사용
      const styleAttribute = createStyleAttribute(factory, node.styles);
      attributes.push(styleAttribute);
    }
  } else if (hasStyle(node) && node.styles) {
    // 루트가 아닌 경우: 스타일 상수를 참조하도록 변경
    const styleKey = getStyleKeyForElement(node.id);
    const styleIdentifier = factory.createPropertyAccessExpression(
      factory.createIdentifier("styles"),
      factory.createIdentifier(styleKey)
    );
    const cssCall = factory.createCallExpression(
      factory.createIdentifier("css"),
      undefined,
      [styleIdentifier]
    );
    const styleAttribute = factory.createJsxAttribute(
      factory.createIdentifier("className"),
      factory.createJsxExpression(undefined, cssCall)
    );
    attributes.push(styleAttribute);
  }

  // attrs를 JSX 속성으로 변환
  // 예: { disabled: 'isDisabled' } → disabled={isDisabled}
  if (node.attrs) {
    for (const [attrName, propName] of Object.entries(node.attrs)) {
      const propIdentifier = factory.createIdentifier(propName);
      const jsxAttribute = factory.createJsxAttribute(
        factory.createIdentifier(attrName),
        factory.createJsxExpression(undefined, propIdentifier)
      );
      attributes.push(jsxAttribute);
    }
  }

  return factory.createJsxAttributes(attributes);
}
