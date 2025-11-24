import type { IPrettifierStrategy } from "./IPrettifierStrategy";
import { StyleCleaner } from "../cleaners/StyleCleaner";
import { NodeRemover } from "../cleaners/NodeRemover";
import { PropsCleaner } from "@frontend/ui/domain/transpiler/prettifier/cleaners/PropsCleaner";
import { AstTree } from "@frontend/ui/domain/transpiler/types/ast";

import { traverseAST } from "@frontend/ui/domain/transpiler/utils/ast-tree-utils";

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

  public prettifyNode(ast: AstTree): AstTree {
    const cleanedProps = this.propsCleaner.clean(ast.props);

    this.convertBooleanProp(ast);
    this.deleteMargin(ast);
    this.normalizeText(ast);
    this.convertKind(ast);
    this.normalizeNodes(ast);
    this.normalizeStyles(ast);
    return {
      ...ast,
      props: cleanedProps,
    };
  }

  protected normalizeNodes(ast: AstTree) {
    /**
     * 불필요한 태그 제거
     */
    traverseAST(ast.root, (path) => {
      if (path.node.tag === "hr") {
        if (path.node.figmaStyles?.height === 0) {
          path.remove();
        }
      }
    });
  }

  protected convertKind(ast: AstTree) {
    /**
     * 바인딩이 있으면 Slot 타입으로 변경한다.
     */
    traverseAST(ast.root, (path) => {
      if (path.node.bindings && path.node.bindings.length > 0) {
        path.node.kind = "Slot";
      }
    });
  }

  protected normalizeText(ast: AstTree): void {
    traverseAST(ast.root, (path) => {
      if (path.node.originalType === "TEXT" && path.node.tag === "span") {
        path.node.styles["color"] = path.node.styles["backgroundColor"];
        delete path.node.styles["backgroundColor"];
        delete path.node.styles["width"];
        delete path.node.styles["height"];
      }
    });
  }

  /**
   * props에서 boolean 형태가 특정 조건을 만족할 때 Componenet 타입으로 변경된다.
   * true, false 일때 ComponentStructure의 노드 개수가 바뀐다면 Component 타입으로 변경된다.
   */
  protected convertBooleanProp(ast: AstTree): void {
    const props = ast.props;

    // boolean 타입의 prop들을 찾기 (variantOptions가 "true"/"True"와 "false"/"False"만 포함하고 길이가 2인 경우)
    const booleanProps = props.filter((prop) => {
      if (!prop.variantOptions || prop.variantOptions.length !== 2) {
        return false;
      }
      const hasTrue =
        prop.variantOptions.includes("true") ||
        prop.variantOptions.includes("True");
      const hasFalse =
        prop.variantOptions.includes("false") ||
        prop.variantOptions.includes("False");
      return hasTrue && hasFalse;
    });

    if (booleanProps.length === 0) {
      return;
    }

    // Slot 노드들과 연결된 prop ID 수집
    const slotPropIds = new Set<string>();
    traverseAST(ast.root, (path) => {
      if (path.node.kind === "Slot" && path.node.slotProp) {
        for (const slotProp of path.node.slotProp) {
          if (slotProp.propId) {
            slotPropIds.add(slotProp.propId);
          }
        }
      }
    });

    // boolean prop이 Slot과 연결되어 있으면 COMPONENT 타입으로 변경
    for (const booleanProp of booleanProps) {
      if (slotPropIds.has(booleanProp.id)) {
        booleanProp.type = "COMPONENT";
        delete booleanProp.variantOptions;
      }
    }
  }

  protected deleteMargin(ast: AstTree): void {
    /**
     * 모든 margin은 지운다.
     */

    traverseAST(ast.root, (path) => {
      delete path.node.styles.margin;
    });
  }

  protected normalizeStyles(ast: AstTree): void {
    traverseAST(ast.root, (path) => {});
  }
}
