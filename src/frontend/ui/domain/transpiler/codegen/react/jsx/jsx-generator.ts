import ts from "typescript";
import type { ElementASTNode, PropIR } from "../../../types";
import type { VariantStyleIR } from "../../../types";
import type { StateBinding } from "../../../types/binding";
import { buildJsxAttributes } from "./jsx-attributes";
import { hasElementContent, buildJsxChildren } from "./jsx-children";
import {
  parseVisibleExpression,
  wrapWithConditionalRendering,
} from "./conditional-rendering";
import { createBindingExpression } from "../binding/binding-expression";

/**
 * JSX 요소 생성 관련 함수
 */

/**
 * Self-closing JSX 요소 생성: <tag ... />
 */
export function createSelfClosingJsxElement(
  factory: ts.NodeFactory,
  tagName: ts.Identifier,
  attributes: ts.JsxAttributes
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
  variantStyleMap?: Map<string, VariantStyleIR>,
  states?: StateBinding[]
): ts.JsxElement {
  const opening = factory.createJsxOpeningElement(
    tagName,
    undefined,
    attributes
  );
  const closing = factory.createJsxClosingElement(tagName);
  const children = buildJsxChildren(
    factory,
    node,
    propsIR,
    variantStyleMap,
    states
  );

  return factory.createJsxElement(opening, children, closing);
}

/**
 * ElementASTNode를 JSX 요소로 변환
 *
 * 변환 규칙:
 * - 자식과 텍스트가 모두 없으면 self-closing 태그
 * - 그 외에는 opening/closing 태그로 변환
 * - visibleMode === "condition"이면 조건부 렌더링으로 감싸기
 * - Slot kind이고 binding이 있으면 바인딩 타입에 따라 조건부 렌더링 또는 자식으로 추가
 */
export function convertElementToJsx(
  factory: ts.NodeFactory,
  node: ElementASTNode,
  propsIR?: PropIR[],
  variantStyleMap?: Map<string, VariantStyleIR>,
  isRoot: boolean = false,
  states?: StateBinding[]
): ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxExpression {
  // Slot 처리: kind가 'Slot'이고 binding이 비어있지 않을 때
  if (node.kind === "Slot" && node.bindings && node.bindings.length > 0) {
    const firstBinding = node.bindings[0];
    const bindingId = firstBinding.id;

    // propsIR에서 바인딩된 요소 찾기
    let boundProp: PropIR | undefined;
    if (propsIR) {
      boundProp = propsIR.find((prop) => prop.id === bindingId);
    }

    // states에서 바인딩된 요소 찾기
    let boundState: StateBinding | undefined;
    if (states) {
      boundState = states.find((state) => state.id === bindingId);
    }

    const boundElement = boundProp || boundState;
    if (boundElement) {
      // 바인딩 타입 확인
      const isBoolean =
        (boundProp && boundProp.type === "BOOLEAN") ||
        (boundState && boundState.tsType === "boolean");
      const isComponent = boundProp && boundProp.type === "COMPONENT";

      // 바인딩 표현식 생성
      const sourceKind = boundProp ? "prop" : "state";
      const sourceName =
        (boundProp && boundProp.normalizedName) ||
        (boundState && boundState.name) ||
        "";

      if (!sourceName) {
        // sourceName이 없으면 일반 처리로 진행
      } else if (isBoolean) {
        // boolean이거나 Component(ReactNode)이면 조건부 렌더링
        const bindingExpression = createBindingExpression(
          factory,
          sourceKind,
          sourceName
        );
        const tagName = factory.createIdentifier(node.tag);
        const attributes = buildJsxAttributes(
          factory,
          node,
          propsIR,
          variantStyleMap,
          isRoot
        );

        // 기본 JSX 요소 생성 (자식 없이)
        const baseJsxElement = createSelfClosingJsxElement(
          factory,
          tagName,
          attributes
        );

        // 조건부 렌더링으로 감싸기
        return wrapWithConditionalRendering(
          factory,
          bindingExpression,
          baseJsxElement
        );
      } else {
        // 그 외에는 태그에 맞게 만들고 자식 요소로 바인딩 요소를 넣기
        const tagName = factory.createIdentifier(node.tag);
        const attributes = buildJsxAttributes(
          factory,
          node,
          propsIR,
          variantStyleMap,
          isRoot
        );

        const bindingExpression = createBindingExpression(
          factory,
          sourceKind,
          sourceName
        );
        const children = [
          factory.createJsxExpression(undefined, bindingExpression),
        ];

        const opening = factory.createJsxOpeningElement(
          tagName,
          undefined,
          attributes
        );
        const closing = factory.createJsxClosingElement(tagName);

        return factory.createJsxElement(opening, children, closing);
      }
    }
  }

  // 일반 요소 처리
  const tagName = factory.createIdentifier(node.tag);
  const attributes = buildJsxAttributes(
    factory,
    node,
    propsIR,
    variantStyleMap,
    isRoot
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
      variantStyleMap,
      states
    );
  }

  // Visibility 조건부 렌더링 처리
  // Note: node.binding은 런타임에 추가되는 속성일 수 있음
  const binding = (node as any).binding;
  if (binding?.visibleMode === "condition" && binding.visibleExpression) {
    const condition = parseVisibleExpression(
      factory,
      binding.visibleExpression
    );
    return wrapWithConditionalRendering(factory, condition, jsxElement);
  }

  return jsxElement;
}
