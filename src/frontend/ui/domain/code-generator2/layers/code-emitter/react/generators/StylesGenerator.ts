/**
 * StylesGenerator
 *
 * UITree의 모든 노드에서 스타일 코드 생성
 */

import type { UITree, UINode, StyleObject } from "../../../../types/types";
import type { IStyleStrategy, StyleResult } from "../style-strategy/IStyleStrategy";

export class StylesGenerator {
  /**
   * 스타일 코드 생성
   */
  static generate(
    uiTree: UITree,
    componentName: string,
    styleStrategy: IStyleStrategy
  ): string {
    const styleResults: StyleResult[] = [];

    // 모든 노드에서 스타일 수집
    this.collectStyles(uiTree.root, styleStrategy, styleResults);

    // 빈 스타일 필터링
    const nonEmptyResults = styleResults.filter((r) => !r.isEmpty && r.code);

    if (nonEmptyResults.length === 0) {
      return "// No styles";
    }

    const parts: string[] = [];

    // Tailwind 전략인 경우 cn 함수 추가
    if (styleStrategy.name === "tailwind" && "getCnFunction" in styleStrategy) {
      parts.push((styleStrategy as any).getCnFunction());
      parts.push("");
    }

    parts.push(...nonEmptyResults.map((r) => r.code));

    return parts.join("\n\n");
  }

  /**
   * 재귀적으로 스타일 수집
   */
  private static collectStyles(
    node: UINode,
    styleStrategy: IStyleStrategy,
    results: StyleResult[]
  ): void {
    // 노드에 스타일이 있으면 생성
    if (node.styles) {
      const result = styleStrategy.generateStyle(node.id, node.name, node.styles);
      results.push(result);
    }

    // 자식 노드 순회
    if ("children" in node && node.children) {
      for (const child of node.children) {
        this.collectStyles(child, styleStrategy, results);
      }
    }
  }
}
