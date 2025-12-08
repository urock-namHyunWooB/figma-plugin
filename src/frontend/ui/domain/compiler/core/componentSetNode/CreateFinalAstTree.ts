import SpecDataManager from "@compiler/manager/SpecDataManager";
import { TempAstTree, SuperTreeNode, FinalAstTree } from "@compiler";
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

    const mergedTree = this.mergeVariantTrees(superTree, refinedProps);
    this._tempAstTree = this.convertFinalNode(mergedTree);
  }

  private mergeVariantTrees(superTree: SuperTreeNode, refinedProps: PropsDef) {
    console.log(superTree, refinedProps);
    return superTree;
  }

  private convertFinalNode(superNode: SuperTreeNode): TempAstTree {
    const children = superNode.children
      .filter((child): child is SuperTreeNode => !!child) // undefined 제거
      .map((child) => this.convertFinalNode(child));

    return {
      ...superNode,
      props: {},
      style: {
        base: {},
        dynamic: [],
      },
      children,
    } as TempAstTree;
  }
}

export default CreateFinalAstTree;
