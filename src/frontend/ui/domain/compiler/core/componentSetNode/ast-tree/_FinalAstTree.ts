import SpecDataManager from "@compiler/manager/SpecDataManager";
import { FinalAstTree, MergedNode, StyleObject, TempAstTree } from "@compiler";
import HelperManager from "@compiler/manager/HelperManager";
import { traverseTree } from "@figma/eslint-plugin-figma-plugins/dist/util";
import { traverseBFS } from "@compiler/utils/traverse";

class _FinalAstTree {
  private _finalAstTree: FinalAstTree;

  private specDataManager: SpecDataManager;

  public get finalAstTree() {
    return this._finalAstTree;
  }

  constructor(specDataManager: SpecDataManager, tempAstTree: TempAstTree) {
    this.specDataManager = specDataManager;

    let finalAstTree = this.createFinalAstTree(tempAstTree);
    finalAstTree = this.updateCleanupNodes(finalAstTree);

    this._finalAstTree = finalAstTree;
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
   * 높이값이 0인 노드 삭제 (absoluteBoundingBox)
   * @param astTree
   * @private
   */
  private updateCleanupNodes(astTree: FinalAstTree) {
    const nodesToRemove: FinalAstTree[] = [];

    // 1. 삭제할 노드 수집
    traverseBFS(astTree, (node, meta) => {
      const targetSpec = this.specDataManager.getSpecById(node.id);
      if (targetSpec.absoluteBoundingBox?.height === 0) {
        nodesToRemove.push(node);
      }
    });

    // 2. 수집된 노드들을 트리에서 제거
    nodesToRemove.forEach((node) => {
      if (node.parent) {
        node.parent.children = node.parent.children.filter(
          (child) => child !== node
        );
      }
    });

    return astTree;
  }

  /**
   * 최적의 스타일을 세팅한다.
   * @param astTree
   * @private
   */
  private updateStyle(astTree: FinalAstTree) {
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
