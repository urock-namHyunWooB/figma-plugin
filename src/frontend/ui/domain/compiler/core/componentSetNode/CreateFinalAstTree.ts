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

    // 변경 후 제안
    const pivotCss = pivotTree.style.base;
    const targetCss = targetTree.cssStyle;
    const pivotName = pivotTree.name;
    const targetName = targetTree.figmaStyle!.name;

    if (!targetName) {
      console.warn(`targetTree ${targetTree.id} is not have figmaStyle name`);
    }

    this._diffStyle(pivotCss, targetCss, pivotName, targetName);
  }

  private _diffStyle(
    pivotStyle: Record<string, any>,
    targetStyle: Record<string, any>,
    pivotName: string,
    targetName: string
  ) {
    const diff: Record<string, any> = {
      base: {},
      dynamic: [],
    };

    /**
     * A,B 둘 다 있고 값도 같으면 base에 해당 style 넣기
     * A,B 둘다 있지만 값이 서로 다르면 base에 A값 넣고 dynamic에 B 넣기
     * A에만 있으면 dynamic에 A에 넣기
     * B에만 있으면 dynamic에 B에 넣기
     */

    return diff;
  }
}

export default CreateFinalAstTree;
