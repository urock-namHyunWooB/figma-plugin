import { RenderTree, SuperTreeNode } from "@compiler";
import SpecDataManager from "@compiler/manager/SpecDataManager";
import NodeMatcher from "@compiler/core/NodeMatcher";
import { getNodesAtDepth, traverseBFS } from "@compiler/utils/traverse";
import debug from "@compiler/manager/DebuggingManager";
import _SortNodes from "@compiler/core/componentSetNode/super-tree/_SortNodes";
import { UnionFind } from "../../../manager/HelperManager";

//TODO 구조에 따라서 슈퍼트리, 슬롯 + 레이아웃 전략을 한다.
class CreateSuperTree {
  private renderTree: RenderTree;
  private specDataManager: SpecDataManager;
  private matcher: NodeMatcher;

  private superTree: SuperTreeNode;

  private SortNodes: _SortNodes;

  constructor(
    renderTree: RenderTree,
    specDataManager: SpecDataManager,
    matcher: NodeMatcher
  ) {
    this.renderTree = renderTree;
    this.specDataManager = specDataManager;
    this.matcher = matcher;

    this.SortNodes = new _SortNodes(specDataManager);

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

    let superTree = components
      .map((comp) => this._convertSuperTreeNode(comp, null, comp.name)!)
      .reduce((superTree, target) => this._mergeTree(superTree, target));

    superTree = this.updateSquashByIou(superTree, components);
    superTree = this.updateSquashFrameNode(superTree);

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
      },
    };

    node.children = renderTree.children.map((child, index) =>
      this._convertSuperTreeNode(child, node, variantName, index)
    );

    return node;
  }

  /**
   *
   * - components를 순회하면서 어떤 노드 다음에 어떤 노드가 오는지 방향 그래프로 저장
   * 방향 그래프를 기반으로 위상 정렬을 하고 그 결과를 superTree의 children에 적용
   * 그 후 다시 비슷한 노드를 합치는 작업을 한다.
   *
   * - 모든 노드를 부모 기준으로 같은 타입끼리 겹치면 스쿼시
   */
  private updateSquashByIou(
    superTree: SuperTreeNode,
    components: RenderTree[]
  ) {
    // 스쿼시 로직
    const IOU_THRESHOLD = 0.5; // 기준값 조절 필요
    const uf = new UnionFind();

    // 1. 타입별로 노드 그룹핑
    const nodesByType = new Map<string, SuperTreeNode[]>();
    const nodeMap = new Map<string, SuperTreeNode>(); // id → node

    traverseBFS(superTree, (node) => {
      if (!nodesByType.has(node.type)) {
        nodesByType.set(node.type, []);
      }
      nodesByType.get(node.type)!.push(node);
      nodeMap.set(node.id, node);
    });

    // 2. 같은 타입 내에서 겹치는 노드들 union
    for (const [type, nodes] of nodesByType) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const iou = this.matcher.getIou2(nodes[i], nodes[j]);

          if (iou !== null && iou >= IOU_THRESHOLD) {
            uf.union(nodes[i].id, nodes[j].id);
          }
        }
      }
    }

    // 3. 그룹별로 노드 수집
    const groups = new Map<string, SuperTreeNode[]>();

    for (const [id, node] of nodeMap) {
      const root = uf.find(id);
      if (!groups.has(root)) {
        groups.set(root, []);
      }
      groups.get(root)!.push(node);
    }

    // 4. 결과 확인 (2개 이상인 그룹만 = 스쿼시 대상)
    for (const [rootId, groupNodes] of groups) {
      if (groupNodes.length > 1) {
        console.log(
          `스쿼시 그룹 [${groupNodes[0].type}]:`,
          groupNodes.map((n) => n.name).join(", ")
        );
        console.log(groupNodes);
      }
    }

    /**
     * 스쿼시 정책은 A,B에서 A를 B에 혹은 B를 A에 합칠때 위상 정렬이 깨지지 않는 쪽으로 합치면 된다.
     */

    return superTree;
  }

  /**
   * - node가 frame이라면 상위 요소 오토레이아웃과 frame 요소 오토레이아웃이 같다면 Frame을 상위 요소에 스쿼시
   * @private
   */
  private updateSquashFrameNode(superTree: SuperTreeNode) {
    //TODO
    return superTree;
  }
}

export default CreateSuperTree;
