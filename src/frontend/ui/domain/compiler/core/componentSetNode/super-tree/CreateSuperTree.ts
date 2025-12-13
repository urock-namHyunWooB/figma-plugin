import { RenderTree, SuperTreeNode } from "@compiler";
import SpecDataManager from "@compiler/manager/SpecDataManager";
import NodeMatcher from "@compiler/core/NodeMatcher";
import { getNodesAtDepth, traverseBFS } from "@compiler/utils/traverse";
import debug from "@compiler/manager/DebuggingManager";
import _SortNodes from "@compiler/core/componentSetNode/super-tree/_SortNodes";
import {
  UnionFind,
  DirectedGraph,
  buildOrderGraphFromComponents,
  determineSquashStrategy,
} from "../../../manager/HelperManager";
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
    this.UpdateSquashByIou = new UpdateSquashByIou(matcher);

    const components = this.renderTree.children;
    // 1. 원본 components로 방향 그래프 구축

    let superTree = components
      .map((comp) => this._convertSuperTreeNode(comp, null, comp.name)!)
      .reduce((superTree, target) => this._mergeTree(superTree, target));

    superTree = this.UpdateSquashByIou.updateSquashByIou(superTree, components);
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
      },
    };

    node.children = renderTree.children.map((child, index) =>
      this._convertSuperTreeNode(child, node, variantName, index)
    );

    return node;
  }

  private static readonly IOU_THRESHOLD = 0.5;

  /**
   * 모든 노드를 Component 기준으로 같은 타입끼리 겹치면 스쿼시
   * - 스쿼시 기준은 스쿼시 해도 위상정렬이 깨지지 않는 방향
   * - 양쪽 다 가능하면 depth가 깊거나 형제노드가 많은 쪽을 유지
   */
  private updateSquashByIou(
    superTree: SuperTreeNode,
    components: RenderTree[]
  ) {
    const { nodesByType, nodeMap } = this.groupNodesByType(superTree);

    const squashGroups = this.findSquashGroups(nodesByType, nodeMap);
    const { graphs } = buildOrderGraphFromComponents(components);

    this.processSquashGroups(squashGroups, graphs);

    return superTree;
  }

  /** 타입별로 노드 그룹핑 */
  private groupNodesByType(superTree: SuperTreeNode) {
    const nodesByType = new Map<string, SuperTreeNode[]>();
    const nodeMap = new Map<string, SuperTreeNode>();

    traverseBFS(superTree, (node) => {
      if (!nodesByType.has(node.type)) {
        nodesByType.set(node.type, []);
      }
      nodesByType.get(node.type)!.push(node);
      nodeMap.set(node.id, node);
    });

    return { nodesByType, nodeMap };
  }

  /** IOU 기반으로 스쿼시 대상 그룹 찾기 */
  private findSquashGroups(
    nodesByType: Map<string, SuperTreeNode[]>,
    nodeMap: Map<string, SuperTreeNode>
  ): Map<string, SuperTreeNode[]> {
    const uf = new UnionFind();

    // 같은 타입 내에서 IOU가 높은 노드들을 union
    for (const [_, nodes] of nodesByType) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const iou = this.matcher.getIou2(nodes[i], nodes[j]);
          if (iou !== null && iou >= CreateSuperTree.IOU_THRESHOLD) {
            uf.union(nodes[i].id, nodes[j].id);
          }
        }
      }
    }

    // 그룹별로 노드 수집
    const groups = new Map<string, SuperTreeNode[]>();
    for (const [id, node] of nodeMap) {
      const root = uf.find(id);
      if (!groups.has(root)) {
        groups.set(root, []);
      }
      groups.get(root)!.push(node);
    }

    return groups;
  }

  /** 스쿼시 그룹들 처리 */
  private processSquashGroups(
    groups: Map<string, SuperTreeNode[]>,
    graphs: Map<string, DirectedGraph>
  ) {
    for (const [_, groupNodes] of groups) {
      if (groupNodes.length <= 1) continue;
      this.processSquashGroup(groupNodes, graphs);
    }
  }

  /** 단일 스쿼시 그룹 처리 */
  private processSquashGroup(
    groupNodes: SuperTreeNode[],
    graphs: Map<string, DirectedGraph>
  ) {
    const squashedNodes = new Set<string>();

    for (let i = 0; i < groupNodes.length; i++) {
      for (let j = i + 1; j < groupNodes.length; j++) {
        const nodeA = groupNodes[i];
        const nodeB = groupNodes[j];

        if (squashedNodes.has(nodeA.id) || squashedNodes.has(nodeB.id)) {
          continue;
        }

        const squashResult = this.trySquashNodes(nodeA, nodeB, graphs);
        if (squashResult) {
          squashedNodes.add(squashResult.removedId);
        }
      }
    }
  }

  /** 두 노드 스쿼시 시도, 성공 시 제거된 노드 ID 반환 */
  private trySquashNodes(
    nodeA: SuperTreeNode,
    nodeB: SuperTreeNode,
    graphs: Map<string, DirectedGraph>
  ): { removedId: string } | null {
    const result = determineSquashStrategy(
      graphs,
      { id: nodeA.id, parentId: nodeA.parent?.id || "" },
      { id: nodeB.id, parentId: nodeB.parent?.id || "" }
    );

    if (!result.canSquash) return null;

    const { nodeToKeep, nodeToRemove } = this.decideSquashDirection(
      nodeA,
      nodeB,
      result.direction
    );

    this.squashNode(nodeToRemove, nodeToKeep);
    return { removedId: nodeToRemove.id };
  }

  /** 스쿼시 방향 결정 */
  private decideSquashDirection(
    nodeA: SuperTreeNode,
    nodeB: SuperTreeNode,
    direction: "A_TO_B" | "B_TO_A" | "BOTH_OK" | null
  ): { nodeToKeep: SuperTreeNode; nodeToRemove: SuperTreeNode } {
    switch (direction) {
      case "A_TO_B":
        return { nodeToKeep: nodeB, nodeToRemove: nodeA };
      case "B_TO_A":
        return { nodeToKeep: nodeA, nodeToRemove: nodeB };
      case "BOTH_OK":
      default:
        return this.decideByDepthAndSiblings(nodeA, nodeB);
    }
  }

  /** depth와 sibling 수 기준으로 유지할 노드 결정 */
  private decideByDepthAndSiblings(
    nodeA: SuperTreeNode,
    nodeB: SuperTreeNode
  ): { nodeToKeep: SuperTreeNode; nodeToRemove: SuperTreeNode } {
    const depthA = this.getNodeDepth(nodeA);
    const depthB = this.getNodeDepth(nodeB);

    // depth가 깊은 쪽 유지 (더 구체적인 위치)
    if (depthB > depthA) {
      return { nodeToKeep: nodeB, nodeToRemove: nodeA };
    }
    if (depthA > depthB) {
      return { nodeToKeep: nodeA, nodeToRemove: nodeB };
    }

    // depth가 같으면 sibling이 많은 쪽 유지
    const siblingCountA = nodeA.parent?.children.length || 0;
    const siblingCountB = nodeB.parent?.children.length || 0;

    if (siblingCountB > siblingCountA) {
      return { nodeToKeep: nodeB, nodeToRemove: nodeA };
    }
    return { nodeToKeep: nodeA, nodeToRemove: nodeB };
  }

  /** 노드의 depth 계산 (순환 참조 방지 포함) */
  private getNodeDepth(node: SuperTreeNode): number {
    let depth = 0;
    let current = node.parent;
    const visited = new Set<string>();

    while (current) {
      if (visited.has(current.id)) break;
      visited.add(current.id);
      depth++;
      current = current.parent;
    }

    return depth;
  }

  /**
   * nodeToRemove를 nodeToKeep에 합칩니다.
   * @param nodeToRemove - 제거될 노드 (합쳐지는 쪽)
   * @param nodeToKeep - 유지될 노드 (합치는 쪽)
   */
  private squashNode(nodeToRemove: SuperTreeNode, nodeToKeep: SuperTreeNode) {
    // 1. mergedNode 합치기
    nodeToKeep.mergedNode.push(...nodeToRemove.mergedNode);

    // 2. 부모의 children에서 제거
    if (nodeToRemove.parent) {
      const parent = nodeToRemove.parent;
      const index = parent.children.indexOf(nodeToRemove);
      if (index !== -1) {
        parent.children.splice(index, 1);
      }
    }

    // 3. nodeToRemove의 children이 있으면 nodeToKeep에 추가
    // (단순히 이동만, 재귀 없음)
    for (const child of nodeToRemove.children) {
      if (!child) continue;
      child.parent = nodeToKeep;
      nodeToKeep.children.push(child);
    }
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
