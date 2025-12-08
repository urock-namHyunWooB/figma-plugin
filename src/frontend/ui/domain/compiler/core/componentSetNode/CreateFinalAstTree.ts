import SpecDataManager from "@compiler/manager/SpecDataManager";
import { FinalAstTree, SuperTreeNode } from "@compiler";

/**
 * 슈퍼트리에 각 variant 트리를 diff 해서 슈퍼트리 노드 하나하나 값을 채워나간다.
 */
class CreateFinalAstTree {
  private specDataManager: SpecDataManager;
  private superTree: SuperTreeNode;

  private _finalAstTree: FinalAstTree;

  public get finalAstTree() {
    return this._finalAstTree;
  }

  constructor(specDataManager: SpecDataManager, superTree: SuperTreeNode) {
    this.specDataManager = specDataManager;
    this.superTree = superTree;

    const mergedTree = this.mergeVariantTrees();
    this._finalAstTree = this.convertFinalNode(mergedTree);
  }

  private mergeVariantTrees() {
    const superTree = this.superTree;

    return superTree;
  }

  private convertFinalNode(superNode: SuperTreeNode): FinalAstTree {
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
    } as FinalAstTree;
  }
}

export default CreateFinalAstTree;
