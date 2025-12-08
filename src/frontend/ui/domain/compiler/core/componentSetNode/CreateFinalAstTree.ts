import SpecDataManager from "@compiler/manager/SpecDataManager";
import { FinalAstTree, SuperTreeNode } from "@compiler";

/**
 * 슈퍼트리에 각 variant 트리를 diff 해서 슈퍼트리 노드 하나하나 값을 채워나간다.
 */
class CreateFinalAstTree {
  private specDataManager: SpecDataManager;
  private superTree: SuperTreeNode;

  private finalAstTree: FinalAstTree;

  public get finalAstTree() {
    return this.finalAstTree;
  }

  constructor(specDataManager: SpecDataManager, superTree: SuperTreeNode) {
    this.specDataManager = specDataManager;
    this.superTree = superTree;

    this.finalAstTree = this.mergeVariantTrees();
  }

  private mergeVariantTrees() {
    const superTree = this.superTree;
    const variantTrees = this.specDataManager.getRenderTree().children;
  }

  private createFinalNode(superNode: SuperTreeNode): FinalAstTree {
    return {
      ...superNode,
      props: {
        visible: { type: "static", value: true }, // 기본값
      },
      style: {
        base: {},
        dynamic: [],
      },
      children: [], // 나중에 채움
      sourceNodeMap: {}, // 여기서 채워야 함
    } as FinalAstTree;
  }
}

export default CreateFinalAstTree;
