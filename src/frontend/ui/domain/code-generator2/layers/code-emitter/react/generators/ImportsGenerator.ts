/**
 * ImportsGenerator
 *
 * UITree에서 필요한 import 문 생성
 */

import type { UITree, UINode } from "../../../../types/types";
import type { IStyleStrategy } from "../style-strategy/IStyleStrategy";

export class ImportsGenerator {
  /**
   * import 문 생성
   */
  static generate(uiTree: UITree, styleStrategy: IStyleStrategy): string {
    const imports: string[] = [];

    // 1. React import
    imports.push('import React from "react";');

    // 2. 스타일 전략 imports
    imports.push(...styleStrategy.getImports());

    // 3. 외부 컴포넌트 imports (type: "component"인 노드)
    const externalComponents = this.collectExternalComponents(uiTree.root);
    for (const component of externalComponents) {
      imports.push(`import { ${component} } from "./${component}";`);
    }

    return imports.join("\n");
  }

  /**
   * 외부 컴포넌트 수집 (type: "component"인 노드)
   */
  private static collectExternalComponents(node: UINode): Set<string> {
    const components = new Set<string>();

    if (node.type === "component") {
      const componentName = this.toComponentName(node.name);
      components.add(componentName);
    }

    if ("children" in node && node.children) {
      for (const child of node.children) {
        const childComponents = this.collectExternalComponents(child);
        childComponents.forEach((c) => components.add(c));
      }
    }

    return components;
  }

  /**
   * 컴포넌트 이름 변환 (PascalCase, 특수문자 제거)
   */
  private static toComponentName(name: string): string {
    // 영문/숫자만 추출
    let normalized = name
      .replace(/[^a-zA-Z0-9\s]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join("");

    // 영문/숫자가 없으면 fallback
    if (!normalized || normalized.length === 0) {
      normalized = `Component${this.simpleHash(name)}`;
    }

    // 숫자로 시작하면 앞에 _ 추가
    if (/^[0-9]/.test(normalized)) {
      normalized = "_" + normalized;
    }

    return normalized;
  }

  private static simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36).substring(0, 6);
  }
}
