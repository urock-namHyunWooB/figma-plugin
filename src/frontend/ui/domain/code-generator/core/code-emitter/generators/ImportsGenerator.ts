/**
 * ImportsGenerator
 *
 * DesignTree에서 import 문을 생성합니다.
 * - React import
 * - 스타일 전략별 import (StyleStrategy에서 위임)
 * - 외부 컴포넌트 import
 */

import ts from "typescript";
import type { DesignTree, DesignNode } from "@code-generator/types/architecture";
import type { IStyleStrategy } from "../style-strategy/IStyleStrategy";

/**
 * 외부 컴포넌트 정보
 */
interface ExternalComponentInfo {
  componentName: string;
  componentSetId: string;
}

class ImportsGenerator {
  private factory: ts.NodeFactory;

  constructor(factory: ts.NodeFactory) {
    this.factory = factory;
  }

  /**
   * import 문 생성
   *
   * @param tree - DesignTree
   * @param strategy - StyleStrategy (스타일별 import 생성)
   * @returns import 선언 배열
   */
  generate(tree: DesignTree, strategy: IStyleStrategy): ts.ImportDeclaration[] {
    const imports: ts.ImportDeclaration[] = [];

    // 1. React import
    imports.push(this.createReactImport());

    // 2. 스타일 전략별 import (Emotion css, Tailwind cn 등)
    imports.push(...strategy.generateImports());

    // 3. 외부 컴포넌트 import (같은 파일에 생성되므로 현재는 미사용)
    // const externalComponents = this.collectExternalComponents(tree.root);
    // imports.push(...externalComponents.map(c => this.createExternalComponentImport(c.componentName)));

    return imports;
  }

  /**
   * React import 생성
   * import React from "react";
   */
  private createReactImport(): ts.ImportDeclaration {
    return this.factory.createImportDeclaration(
      undefined,
      this.factory.createImportClause(
        false,
        this.factory.createIdentifier("React"),
        undefined
      ),
      this.factory.createStringLiteral("react")
    );
  }

  /**
   * 외부 컴포넌트 import 생성
   * import { ComponentName } from "./ComponentName";
   *
   * NOTE: 현재는 모든 의존 컴포넌트가 같은 파일에 생성되므로 사용하지 않음
   */
  private createExternalComponentImport(
    componentName: string
  ): ts.ImportDeclaration {
    return this.factory.createImportDeclaration(
      undefined,
      this.factory.createImportClause(
        false,
        undefined,
        this.factory.createNamedImports([
          this.factory.createImportSpecifier(
            false,
            undefined,
            this.factory.createIdentifier(componentName)
          ),
        ])
      ),
      this.factory.createStringLiteral(`./${componentName}`)
    );
  }

  /**
   * DesignTree에서 외부 컴포넌트 목록 수집
   * externalRef가 있는 노드들을 찾아서 componentName 중복 제거
   */
  private collectExternalComponents(
    root: DesignNode
  ): ExternalComponentInfo[] {
    const componentsMap = new Map<string, string>(); // componentSetId → componentName

    const traverse = (node: DesignNode) => {
      if (node.externalRef) {
        const { componentSetId, componentName } = node.externalRef;
        if (!componentsMap.has(componentSetId)) {
          componentsMap.set(componentSetId, componentName);
        }
      }
      node.children.forEach(traverse);
    };

    traverse(root);

    return Array.from(componentsMap.entries()).map(
      ([componentSetId, componentName]) => ({
        componentSetId,
        componentName,
      })
    );
  }
}

export default ImportsGenerator;
