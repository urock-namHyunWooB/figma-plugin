import type { IPrettifierStrategy } from "./IPrettifierStrategy";
import { StyleCleaner } from "../cleaners/StyleCleaner";
import { NodeRemover } from "../cleaners/NodeRemover";
import { PropsCleaner } from "@frontend/ui/domain/transpiler/prettifier/cleaners/PropsCleaner";
import { AstTree } from "@frontend/ui/domain/transpiler/types/ast";

import {
  traverseUnifiedNode,
  UnifiedNodePath,
} from "@frontend/ui/domain/transpiler/utils/ast-tree-utils";
import { PropIR } from "@frontend/ui/domain/transpiler";

/**
 * 기본 prettify 전략 구현
 * 모든 타입에 공통으로 적용되는 기본 로직
 */
export class DefaultPrettifierStrategy implements IPrettifierStrategy {
  private styleCleaner = new StyleCleaner();
  private nodeRemover = new NodeRemover();
  private propsCleaner = new PropsCleaner();

  public canHandle(_ast: AstTree): boolean {
    // 기본 전략은 항상 적용 가능
    return true;
  }

  public prettifyNode(ast: AstTree, props: PropIR[]) {
    const cleanedProps = this.propsCleaner.clean(props);

    this.deleteMargin(ast);
    this.normalizeNodes(ast);
    return {
      unifiedNode: ast,
      props: cleanedProps,
    };
  }

  protected normalizeNodes(ast: AstTree) {
    /**
     * 불필요한 태그 제거
     */
    traverseUnifiedNode(ast, (path) => {
      if (path.node.props.style?.height === 0) {
        path.remove();
      }
    });
  }

  /**
   * props에서 boolean 형태가 특정 조건을 만족할 때 Componenet 타입으로 변경된다.
   * true, false 일때 ComponentStructure의 노드 개수가 바뀐다면 Component 타입으로 변경된다.
   */

  protected deleteMargin(ast: AstTree): void {
    /**
     * 모든 margin은 지운다.
     */

    traverseUnifiedNode(ast, (path) => {
      delete path.node.props.style.margin;
    });
  }
}
