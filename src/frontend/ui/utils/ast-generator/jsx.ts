/**
 * JSX 관련 AST 생성
 */

import * as ts from "typescript";
import type { ComponentDSL } from "./types";
import {
  extractBindingName,
  parseVisibleExpression,
  parseExpressionString,
} from "./expressions";

/**
 * Return 문 생성
 */
export function createReturnStatement(
  dsl: ComponentDSL,
  elementIdToStyleKey: Map<string, string>,
): ts.ReturnStatement {
  if (!dsl.componentStructure) {
    // componentStructure가 없으면 빈 Fragment 반환
    return ts.factory.createReturnStatement(
      ts.factory.createJsxFragment(
        ts.factory.createJsxOpeningFragment(),
        [],
        ts.factory.createJsxJsxClosingFragment(),
      ),
    );
  }

  const rootElement = dsl.metadata.rootElement || "div";
  const rootTag = rootElement !== "div" ? rootElement : null;

  // Root children 생성
  const rootChildren: ts.JsxChild[] = [];
  if (dsl.componentStructure.root.children) {
    dsl.componentStructure.root.children.forEach((child) => {
      const jsxElement = createJSXElementFromStructure(
        child,
        dsl.elementBindings || {},
        elementIdToStyleKey,
      );
      if (jsxElement) {
        rootChildren.push(jsxElement);
      }
    });
  }

  // Root JSX 요소 생성
  const rootJSX = rootTag
    ? ts.factory.createJsxElement(
        ts.factory.createJsxOpeningElement(
          ts.factory.createIdentifier(rootTag),
          undefined,
          ts.factory.createJsxAttributes([
            ts.factory.createJsxAttribute(
              ts.factory.createIdentifier("style"),
              ts.factory.createJsxExpression(
                undefined,
                ts.factory.createPropertyAccessExpression(
                  ts.factory.createIdentifier("styles"),
                  ts.factory.createIdentifier("container"),
                ),
              ),
            ),
          ]),
        ),
        rootChildren,
        ts.factory.createJsxClosingElement(
          ts.factory.createIdentifier(rootTag),
        ),
      )
    : ts.factory.createJsxFragment(
        ts.factory.createJsxOpeningFragment(),
        rootChildren,
        ts.factory.createJsxJsxClosingFragment(),
      );

  return ts.factory.createReturnStatement(rootJSX);
}

/**
 * StructureElement를 JSX 요소로 변환 (재귀)
 */
function createJSXElementFromStructure(
  element: any,
  elementBindings: ComponentDSL["elementBindings"] | null,
  elementIdToStyleKey: Map<string, string>,
): ts.JsxElement | ts.JsxExpression | null {
  if (!element || !element.type || !element.id) return null;

  // visible: false인 요소는 렌더링하지 않음
  if (element.visible === false) return null;

  // 바인딩 정보 확인
  const binding = elementBindings?.[element.id];
  const visibleMode = binding?.visibleMode || "always";
  const visibleExpression = binding?.visibleExpression || "";

  // visibleMode가 "hidden"이면 렌더링하지 않음
  if (visibleMode === "hidden") return null;

  const tagName = getJSXTagName(element.type);
  const styleKey = getElementStyleKey(element.id, elementIdToStyleKey);

  // JSX 속성 생성
  const attributes: ts.JsxAttributeLike[] = [];
  if (styleKey) {
    attributes.push(
      ts.factory.createJsxAttribute(
        ts.factory.createIdentifier("style"),
        ts.factory.createJsxExpression(
          undefined,
          ts.factory.createPropertyAccessExpression(
            ts.factory.createIdentifier("styles"),
            ts.factory.createIdentifier(styleKey),
          ),
        ),
      ),
    );
  }

  // 바인딩된 prop 확인
  const hasBinding =
    binding?.connectedPropName &&
    (element.type === "TEXT" || element.type === "INSTANCE");
  const boundPropName =
    hasBinding && binding.connectedPropName
      ? extractBindingName(binding.connectedPropName)
      : null;

  // 자식 요소 생성
  const children: ts.JsxChild[] = [];

  if (hasBinding && boundPropName) {
    // 바인딩이 있으면 prop을 자식으로
    children.push(
      ts.factory.createJsxExpression(
        undefined,
        ts.factory.createIdentifier(boundPropName),
      ),
    );
  } else if (element.children && element.children.length > 0) {
    // 자식 요소 재귀 처리
    element.children.forEach((child: any) => {
      const childJSX = createJSXElementFromStructure(
        child,
        elementBindings,
        elementIdToStyleKey,
      );
      if (childJSX) {
        children.push(childJSX as ts.JsxChild);
      }
    });
  }

  const jsxElement = ts.factory.createJsxElement(
    ts.factory.createJsxOpeningElement(
      ts.factory.createIdentifier(tagName),
      undefined,
      ts.factory.createJsxAttributes(attributes),
    ),
    children,
    ts.factory.createJsxClosingElement(ts.factory.createIdentifier(tagName)),
  );

  // 조건부 렌더링 처리
  if (visibleMode === "expression" && visibleExpression) {
    const parsedExpression = parseVisibleExpression(visibleExpression);
    // 표현식을 파싱하여 AST로 변환 (간단한 경우만 처리)
    // 복잡한 표현식은 나중에 개선 필요
    const conditionExpr = parseExpressionString(parsedExpression);
    return ts.factory.createJsxExpression(
      undefined,
      ts.factory.createBinaryExpression(
        conditionExpr,
        ts.factory.createToken(ts.SyntaxKind.AmpersandAmpersandToken),
        jsxElement,
      ),
    );
  }

  return jsxElement;
}

/**
 * Figma type을 JSX 태그명으로 변환
 */
function getJSXTagName(type: string): string {
  if (type === "TEXT") return "span";
  return "div"; // FRAME, RECTANGLE, INSTANCE 등
}

/**
 * Element ID에서 Style Key 추출
 * createStylesObject에서 생성한 매핑 사용
 */
function getElementStyleKey(
  elementId: string,
  elementIdToStyleKey: Map<string, string>,
): string | null {
  return elementIdToStyleKey.get(elementId) || null;
}
