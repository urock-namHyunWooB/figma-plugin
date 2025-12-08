import SpecDataManager from "@compiler/manager/SpecDataManager";
import { TempAstTree, SuperTreeNode, FinalAstTree, StyleTree } from "@compiler";
import { PropsDef } from "@compiler/core/componentSetNode/RefineProps";
/**
 * 슈퍼트리에 각 variant 트리를 diff 해서 슈퍼트리 노드 하나하나 값을 채워나간다.
 */
class CreateFinalAstTree {
  private specDataManager: SpecDataManager;

  private _finalAstTree: FinalAstTree;
  private _tempAstTree: TempAstTree;

  public get finalAstTree() {
    return this._finalAstTree;
  }

  constructor(
    specDataManager: SpecDataManager,
    superTree: SuperTreeNode,
    refinedProps: PropsDef
  ) {
    this.specDataManager = specDataManager;

    this._tempAstTree = this.mergeVariantTrees(superTree, refinedProps);
    console.log("this._tempAstTree", this._tempAstTree);
  }

  private mergeVariantTrees(superTree: SuperTreeNode, refinedProps: PropsDef) {
    const specManager = this.specDataManager;
    const tempAstTree = this.createTempAstTree(superTree, refinedProps);

    const variantTrees = specManager.getRenderTree().children;

    variantTrees.forEach((variantTree) => {
      this._mergeTree(tempAstTree, variantTree);
    });

    return tempAstTree;
  }

  private createTempAstTree(
    superTree: SuperTreeNode,
    refinedProps: PropsDef
  ): TempAstTree {
    /**
     * 최상위 부모만 refinedProps 할당됨.
     */
    const convert = (node: SuperTreeNode, isRoot: boolean): TempAstTree => {
      const styleTree = this.specDataManager.getRenderTreeById(node.id);

      const children = node.children
        .filter((child): child is SuperTreeNode => !!child)
        .map((child) => convert(child, false));

      return {
        ...node,
        props: isRoot ? (refinedProps as any) : {},
        style: {
          base: styleTree?.cssStyle || {},
          dynamic: [],
        },
        children,
      } as TempAstTree;
    };

    return convert(superTree, true);
  }

  private _mergeTree(pivotTree: TempAstTree, targetTree: StyleTree) {
    if (pivotTree.name === targetTree.figmaStyle?.name) return pivotTree;

    const pivotCss = pivotTree.style.base;
    const targetCss = targetTree.cssStyle;
  }

  private _diffStyle(
    pivotStyle: Record<string, any>,
    targetStyle: Record<string, any>
  ) {
    const diff: Record<string, any> = {};

    return diff;
  }
}

export default CreateFinalAstTree;
