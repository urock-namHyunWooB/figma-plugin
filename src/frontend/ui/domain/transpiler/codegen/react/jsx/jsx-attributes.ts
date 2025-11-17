import ts from "typescript";

import { convertStyleToExpression } from "../style/style-converter";
import { createVariantStyleAttribute } from "../style/variant-style-generator";
import type { ElementASTNode, PropIR } from "../../../types";
import type { VariantStyleIR } from "../../../types/props";

/**
 * JSX 속성 생성 관련 함수
 */

/**
 * 요소에 style 속성이 있는지 확인
 */
export function hasStyle(node: ElementASTNode): boolean {
  return !!(node.props?.style && Object.keys(node.props.style).length > 0);
}

/**
 * style 속성 생성: style={...}
 */
export function createStyleAttribute(
  factory: ts.NodeFactory,
  style: Record<string, any>,
): ts.JsxAttribute {
  const styleExpression = convertStyleToExpression(factory, style);
  return factory.createJsxAttribute(
    factory.createIdentifier("style"),
    factory.createJsxExpression(undefined, styleExpression),
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
  isRoot: boolean = false,
): ts.JsxAttributes {
  const attributes: ts.JsxAttributeLike[] = [];

  // 루트 요소이고 variant style이 있는 경우 머지
  if (isRoot && propsIR && variantStyleMap) {
    const styleAttribute = createVariantStyleAttribute(
      factory,
      propsIR,
      variantStyleMap,
    );
    if (styleAttribute) {
      attributes.push(styleAttribute);
    }
  } else if (hasStyle(node) && node.props?.style) {
    const styleAttribute = createStyleAttribute(factory, node.props.style);
    attributes.push(styleAttribute);
  }

  return factory.createJsxAttributes(attributes);
}
