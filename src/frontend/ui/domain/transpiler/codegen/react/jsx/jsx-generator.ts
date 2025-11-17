import ts from "typescript";
import type { ElementASTNode, PropIR } from "../../../types";
import type { VariantStyleIR } from "../../../types/props";
import { buildJsxAttributes } from "./jsx-attributes";
import { hasElementContent, buildJsxChildren } from "./jsx-children";
import {
  parseVisibleExpression,
  wrapWithConditionalRendering,
} from "./conditional-rendering";

/**
 * JSX 요소 생성 관련 함수
 */

/**
 * Self-closing JSX 요소 생성: <tag ... />
 */
export function createSelfClosingJsxElement(
  factory: ts.NodeFactory,
  tagName: ts.Identifier,
  attributes: ts.JsxAttributes,
): ts.JsxSelfClosingElement {
  return factory.createJsxSelfClosingElement(tagName, undefined, attributes);
}

/**
 * 내용이 있는 JSX 요소 생성: <tag ...>...</tag>
 */
export function createJsxElementWithContent(
  factory: ts.NodeFactory,
  tagName: ts.Identifier,
  attributes: ts.JsxAttributes,
  node: ElementASTNode,
  propsIR?: PropIR[],
): ts.JsxElement {
  const opening = factory.createJsxOpeningElement(
    tagName,
    undefined,
    attributes,
  );
  const closing = factory.createJsxClosingElement(tagName);
  const children = buildJsxChildren(factory, node, propsIR);

  return factory.createJsxElement(opening, children, closing);
}

/**
 * ElementASTNode를 JSX 요소로 변환
 *
 * 변환 규칙:
 * - 자식과 텍스트가 모두 없으면 self-closing 태그
 * - 그 외에는 opening/closing 태그로 변환
 * - visibleMode === "condition"이면 조건부 렌더링으로 감싸기
 */
export function convertElementToJsx(
  factory: ts.NodeFactory,
  node: ElementASTNode,
  propsIR?: PropIR[],
  variantStyleMap?: Map<string, VariantStyleIR>,
  isRoot: boolean = false,
): ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxExpression {
  const tagName = factory.createIdentifier(node.tag);
  const attributes = buildJsxAttributes(
    factory,
    node,
    propsIR,
    variantStyleMap,
    isRoot,
  );
  const hasContent = hasElementContent(node);

  let jsxElement: ts.JsxElement | ts.JsxSelfClosingElement;
  if (!hasContent) {
    jsxElement = createSelfClosingJsxElement(factory, tagName, attributes);
  } else {
    jsxElement = createJsxElementWithContent(
      factory,
      tagName,
      attributes,
      node,
      propsIR,
    );
  }

  // Visibility 조건부 렌더링 처리
  if (
    node.binding?.visibleMode === "condition" &&
    node.binding.visibleExpression
  ) {
    const condition = parseVisibleExpression(
      factory,
      node.binding.visibleExpression,
    );
    return wrapWithConditionalRendering(factory, condition, jsxElement);
  }

  return jsxElement;
}
