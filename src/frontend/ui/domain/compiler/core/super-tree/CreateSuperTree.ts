import { RenderTree, SuperTreeNode } from "@compiler";
import SpecDataManager from "@compiler/manager/SpecDataManager";
import NodeMatcher from "@compiler/core/NodeMatcher";
import { getNodesAtDepth, traverseBFS } from "@compiler/utils/traverse";

import _SortNodes from "@compiler/core/super-tree/_SortNodes";
import { UnionFind, DirectedGraph } from "../../manager/HelperManager";
import UpdateSquashByIou from "./squash/UpdateSquashByIou";

//TODO 구조에 따라서 슈퍼트리, 슬롯 + 레이아웃 전략을 한다.
class CreateSuperTree {
  private renderTree: RenderTree;
  private specDataManager: SpecDataManager;
  private matcher: NodeMatcher;

  private superTree: SuperTreeNode;

  private SortNodes: _SortNodes;
  private UpdateSquashByIou: UpdateSquashByIou;

  constructor(
    renderTree: RenderTree,
    specDataManager: SpecDataManager,
    matcher: NodeMatcher
  ) {
    this.renderTree = renderTree;
    this.specDataManager = specDataManager;
    this.matcher = matcher;

    this.SortNodes = new _SortNodes(specDataManager);
    this.UpdateSquashByIou = new UpdateSquashByIou(matcher, specDataManager);

    const rootNodeData = specDataManager.getSpecById(renderTree.id);
    const isComponentSet = rootNodeData?.type === "COMPONENT_SET";

    let superTree: SuperTreeNode;

    if (isComponentSet) {
      // COMPONENT_SET: children(각 variant)을 합쳐서 하나의 트리로
      const components = this.renderTree.children;
      superTree = components
        .map((comp) => this._convertSuperTreeNode(comp, null, comp.name)!)
        .reduce((superTree, target) => this._mergeTree(superTree, target));

      superTree = this.UpdateSquashByIou.updateSquashByIou(
        superTree,
        components
      );
    } else {
      // COMPONENT, FRAME, INSTANCE 등: renderTree 자체를 루트로
      superTree = this._convertSuperTreeNode(
        renderTree,
        null,
        renderTree.name
      )!;
    }

    superTree = this.updateSquashFrameNode(superTree);

    this.superTree = superTree;
  }

  public getSuperTree() {
    return this.superTree;
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

        return;
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
      parent.children.push(node);

      this.SortNodes.sortChildrenNodes(parent);
    }

    return pivotSuperTree;
  }

  private _convertSuperTreeNode(
    renderTree: RenderTree,
    parent: SuperTreeNode | null = null,
    variantName: string | null = null,
    originSiblingIndex: number = 0
  ): SuperTreeNode | undefined {
    const nodeData = this.specDataManager.getSpecById(renderTree.id);
    if (!nodeData) return;

    const node: SuperTreeNode = {
      id: renderTree.id,
      type: nodeData.type,
      name: nodeData.name,
      parent: parent || null,
      children: [],
      mergedNode: [
        {
          id: renderTree.id,
          name: nodeData.name,
          variantName,
        },
      ],
      metaData: {
        originSiblingIndex,
        spec: nodeData,
      },
    };

    node.children = renderTree.children.map((child, index) =>
      this._convertSuperTreeNode(child, node, variantName, index)
    );

    return node;
  }

  /**
   * - node가 frame이라면 상위 요소 오토레이아웃과 frame 요소 오토레이아웃이 같다면 Frame을 상위 요소에 스쿼시
   * @private
   */
  private updateSquashFrameNode(superTree: SuperTreeNode) {
    return superTree;
  }
}

export default CreateSuperTree;
