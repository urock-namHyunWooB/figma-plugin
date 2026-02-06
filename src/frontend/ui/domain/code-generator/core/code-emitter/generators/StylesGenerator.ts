/**
 * StylesGenerator
 *
 * DesignTree에서 CSS 변수와 스타일 함수를 생성합니다.
 * 실제 스타일 생성 로직은 StyleStrategy에 위임합니다.
 *
 * 생성 예시 (Emotion):
 * ```typescript
 * const buttonCss = ($size: Size) => css`
 *   display: flex;
 *   ${sizeStyles[$size]}
 * `;
 *
 * const sizeStyles = {
 *   Large: { padding: "16px" },
 *   Medium: { padding: "12px" },
 * };
 * ```
 *
 * 생성 예시 (Tailwind):
 * ```typescript
 * const cn = (...classes) => classes.filter(Boolean).join(" ");
 *
 * const sizeClasses = {
 *   Large: "p-4",
 *   Medium: "p-3",
 * };
 * ```
 */

import ts from "typescript";
import type { DesignTree, PropDefinition } from "@code-generator/types/architecture";
import type { IStyleStrategy } from "../style-strategy/IStyleStrategy";

class StylesGenerator {
  private factory: ts.NodeFactory;

  constructor(factory: ts.NodeFactory) {
    this.factory = factory;
  }

  /**
   * 스타일 선언부 생성
   *
   * @param tree - DesignTree
   * @param componentName - 컴포넌트 이름 (CSS 변수명 생성에 사용)
   * @param strategy - StyleStrategy (Emotion/Tailwind)
   * @returns 스타일 선언 statement 배열
   */
  generate(
    tree: DesignTree,
    componentName: string,
    strategy: IStyleStrategy
  ): ts.Statement[] {
    // StyleStrategy에 스타일 생성 위임
    // 각 전략이 자체적으로 트리를 순회하며 스타일 변수/함수 생성
    return strategy.generateDeclarations(tree, componentName, tree.props);
  }
}

export default StylesGenerator;
