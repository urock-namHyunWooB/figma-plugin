import SpecDataManager from "@compiler/manager/SpecDataManager";
import { FinalAstTree, MergedNode, StyleObject, TempAstTree } from "@compiler";
import HelperManager from "@compiler/manager/HelperManager";

class _FinalAstTree {
  private _finalAstTree: FinalAstTree;

  public get finalAstTree() {
    return this._finalAstTree;
  }

  constructor(specDataManager: SpecDataManager, tempAstTree: TempAstTree) {
    let finalAstTree = this.createFinalAstTree(tempAstTree);
    finalAstTree = this.updateCleanupNodes(finalAstTree);
    finalAstTree = this.updateStyle(finalAstTree);

    this._finalAstTree = finalAstTree;

    // HelperManager.deepCloneTree();
  }

  private createFinalAstTree(tempAstTree: TempAstTree): FinalAstTree {
    const convert = (
      node: TempAstTree,
      parent: FinalAstTree | null
    ): FinalAstTree => {
      const finalNode: FinalAstTree = {
        id: node.id,
        name: node.name,
        type: node.type,
        props: { ...node.props },
        parent: parent,
        visible: node.visible ?? { type: "static", value: true },
        style: node.style,
        children: [],
      };

      finalNode.children = node.children.map((child) =>
        convert(child, finalNode)
      );

      return finalNode;
    };

    return convert(tempAstTree, null);
  }

  /**
   * 불필요한 노드 삭제
   * @param astTree
   * @private
   */
  private updateCleanupNodes(astTree: FinalAstTree) {
    return astTree;
  }

  /**
   * 최적의 스타일을 세팅한다.
   * @param astTree
   * @private
   */
  private updateStyle(astTree: FinalAstTree) {
    //TODO
    return astTree;
  }

  /**
   * 메타 데이터 추가
   * 유사한 태그 유추
   * @param astTree
   * @private
   */
  private updateMetaData(astTree: FinalAstTree) {}

  /**
   * visible 최적화
   * @param astTree
   * @private
   */
  private updateVisible(astTree: FinalAstTree) {}

  /**
   * Props 최적화
   * @param astTree
   * @private
   */
  private updateProps(astTree: FinalAstTree) {}

  /**
   * 노드 트리 구조 최적화
   * @private
   */
  private updateStructure() {}
}

export default _FinalAstTree;
