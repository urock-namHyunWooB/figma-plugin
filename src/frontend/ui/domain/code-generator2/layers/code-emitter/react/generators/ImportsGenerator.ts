/**
 * ImportsGenerator
 *
 * UITree에서 필요한 import 문 생성
 */

import type { UITree, UINode } from "../../../../types/types";
import type { IStyleStrategy } from "../style-strategy/IStyleStrategy";
import { toComponentName } from "../../../../utils/nameUtils";

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
      const componentName = toComponentName(node.name);
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

}
