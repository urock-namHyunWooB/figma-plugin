import ts from "typescript";
import type { ElementASTNode } from "../../../../types";
import type { PropIR } from "../../../../types/props";
import { createBindingExpression } from "../binding/binding-expression";
import { convertElementToJsx } from "./jsx-generator";

/**
 * JSX 자식 요소 생성 관련 함수
 */

/**
 * 요소에 내용(자식 또는 텍스트)이 있는지 확인
 */
export function hasElementContent(node: ElementASTNode): boolean {
  const hasChildren = node.children && node.children.length > 0;
  const hasText = !!node.textContent?.trim();
  return hasChildren || hasText;
}

/**
 * JSX 자식 요소 배열 생성 (텍스트 + 자식 요소들)
 * Binding 정보에 따라 content/component binding 처리
 */
export function buildJsxChildren(
  factory: ts.NodeFactory,
  node: ElementASTNode,
  propsIR?: PropIR[]
): ts.JsxChild[] {
  const children: ts.JsxChild[] = [];

  // Content Binding: mode === "content"인 경우 텍스트 대신 prop/state 표현식 사용
  if (node.binding?.mode === "content" && node.binding.sourceName) {
    const bindingExpression = createBindingExpression(
      factory,
      node.binding.sourceKind,
      node.binding.sourceName
    );
    children.push(
      factory.createJsxExpression(undefined, bindingExpression)
    );
    // Content binding이 있으면 기존 텍스트와 자식은 무시
    return children;
  }

  // Component Binding: mode === "component"인 경우 prop/state 값을 자식으로 렌더링
  if (node.binding?.mode === "component" && node.binding.sourceName) {
    const bindingExpression = createBindingExpression(
      factory,
      node.binding.sourceKind,
      node.binding.sourceName
    );
    children.push(
      factory.createJsxExpression(undefined, bindingExpression)
    );
    // Component binding이 있으면 기존 자식은 무시 (prop 값만 렌더링)
    return children;
  }

  // 일반 텍스트 (binding이 없거나 다른 mode인 경우)
  if (node.textContent?.trim()) {
    children.push(factory.createJsxText(node.textContent));
  }

  // 자식 요소들
  if (node.children && node.children.length > 0) {
    const childElements = node.children.map((child) =>
      convertElementToJsx(factory, child, propsIR, false)
    );
    children.push(...childElements);
  }

  return children;
}

