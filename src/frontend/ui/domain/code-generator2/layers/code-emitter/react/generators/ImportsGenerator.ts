/**
 * ImportsGenerator
 *
 * SemanticComponent에서 필요한 import 문 생성
 */

import type { SemanticComponent, SemanticNode } from "../../SemanticIR";
import type { IStyleStrategy } from "../style-strategy/IStyleStrategy";
import { toComponentName } from "../../../../utils/nameUtils";

export class ImportsGenerator {
  /**
   * import 문 생성
   */
  static generate(ir: SemanticComponent, styleStrategy: IStyleStrategy): string {
    const imports: string[] = [];

    // 1. React import (state 있으면 useState 포함)
    if (ir.state.length) {
      imports.push('import React, { useState } from "react";');
    } else {
      imports.push('import React from "react";');
    }

    // 2. 스타일 전략 imports
    imports.push(...styleStrategy.getImports());

    // 3. 외부 컴포넌트 imports (kind: "component"인 노드)
    const externalComponents = this.collectExternalComponents(ir.structure);
    for (const component of externalComponents) {
      imports.push(`import { ${component} } from "./${component}";`);
    }

    return imports.join("\n");
  }

  /**
   * 외부 컴포넌트 수집 (kind: "component"인 노드)
   */
  private static collectExternalComponents(node: SemanticNode): Set<string> {
    const components = new Set<string>();

    if (node.kind === "component") {
      const componentName = toComponentName(node.name ?? "");
      components.add(componentName);
    }

    if (node.children) {
      for (const child of node.children) {
        const childComponents = this.collectExternalComponents(child);
        childComponents.forEach((c) => components.add(c));
      }
    }

    return components;
  }

}
