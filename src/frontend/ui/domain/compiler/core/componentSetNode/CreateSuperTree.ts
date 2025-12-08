import { RenderTree, SuperTreeNode } from "@compiler";
import SpecDataManager from "@compiler/manager/SpecDataManager";
import NodeMatcher from "@compiler/core/NodeMatcher";
import { getNodesAtDepth, traverseBFS } from "@compiler/utils/traverse";

//TODO 구조에 따라서 슈퍼트리, 슬롯 + 레이아웃 전략을 한다.
class CreateSuperTree {
  private renderTree: RenderTree;
  private specDataManager: SpecDataManager;
  private matcher: NodeMatcher;

  private superTree: SuperTreeNode;

  constructor(
    renderTree: RenderTree,
    specDataManager: SpecDataManager,
    matcher: NodeMatcher
  ) {
    this.renderTree = renderTree;
    this.specDataManager = specDataManager;
    this.matcher = matcher;

    this.superTree = this.createSuperTree();
  }

  public getSuperTree() {
    return this.superTree;
  }

  /**
   * 모든 컴포넌트 구조를 표현할 수 있는 슈퍼트리를 만듭니다.
   * @private
   */
  private createSuperTree() {
    const components = this.renderTree.children;
    // const superTreeRoot = this._convertSuperTreeNode(this.renderTree);

    let superTree = this._convertSuperTreeNode(components[0])!;

    for (let i = 1; i < components.length; i++) {
      const target = this._convertSuperTreeNode(components[i])!;

      superTree = this._mergeTree(superTree, target);
    }

    return superTree;
  }

  /**
   * 두개 트리를 순서에 맞게 합침.
   * BFS로 탐색해서 병합
   * 각 계층에서 같은게 있나 비교
   * 같은건 합치고
   * 다른건 기존 구조에 ADD
   * @param pivotSuperTree
   * @param targetTree
   * @private
   */
  private _mergeTree(pivotSuperTree: SuperTreeNode, targetTree: SuperTreeNode) {
    // 추가할 노드들을 수집 (순회 중 변경 방지)
    const nodesToAdd: Array<{ parent: SuperTreeNode; node: SuperTreeNode }> =
      [];

    traverseBFS(targetTree, (targetNode, targetMeta) => {
      // 1. 같은 depth에서 동일 노드 찾기
      const sameDepthNodes = getNodesAtDepth(pivotSuperTree, targetMeta.depth);

      const pivotMatchedNode = sameDepthNodes.find((pivot) => {
        return this.matcher.isSameNode(targetNode, pivot);
      });

      if (pivotMatchedNode) {
        pivotMatchedNode.mergedNode.push(...targetNode.mergedNode);

        return; // 이미 존재하면 스킵
      }

      // 2. targetNode의 부모와 매칭되는 pivotTree의 노드 찾기
      if (!targetNode.parent) return; // 루트는 스킵

      const parentDepthNodes = getNodesAtDepth(
        pivotSuperTree,
        targetMeta.depth - 1
      );

      const matchedParent = parentDepthNodes.find((pivot) =>
        this.matcher.isSameNode(targetNode.parent!, pivot)
      );

      if (!matchedParent) return; // 부모를 못 찾으면 스킵

      // 나중에 추가하기 위해 수집
      nodesToAdd.push({ parent: matchedParent, node: targetNode });
    });

    // 순회 완료 후 한꺼번에 추가
    for (const { parent, node } of nodesToAdd) {
      // node.parent = parent;
      parent.children.push(node);
    }

    return pivotSuperTree;
  }

  private _convertSuperTreeNode(
    renderTree: RenderTree,
    parent: SuperTreeNode | null = null
  ): SuperTreeNode | undefined {
    const nodeData = this.specDataManager.getSpecById(renderTree.id);
    if (!nodeData) return;

    const node: SuperTreeNode = {
      id: renderTree.id,
      type: nodeData.type,
      name: nodeData.name,
      parent,
      children: [],
      mergedNode: [{ [nodeData.name]: renderTree.id }], // [추가] 초기화: 현재 Variant ID와 노드 ID 매핑
    };

    node.children = renderTree.children.map((child) =>
      this._convertSuperTreeNode(child, node)
    );

    return node;
  }
}

export default CreateSuperTree;
