import { RenderTree, SuperTreeNode } from "@compiler";
import {
  buildOrderGraphFromComponents,
  determineSquashStrategy,
  DirectedGraph,
  UnionFind,
} from "@compiler/manager/HelperManager";
import { traverseBFS } from "@compiler/utils/traverse";
import NodeMatcher from "../../../NodeMatcher";

class UpdateSquashByIou {
  IOU_THRESHOLD = 0.5;

  private matcher: NodeMatcher;

  constructor(matcher: NodeMatcher) {
    this.matcher = matcher;
  }

  public updateSquashByIou(superTree: SuperTreeNode, components: RenderTree[]) {
    return superTree;
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
          if (iou !== null && iou >= this.IOU_THRESHOLD) {
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
}

export default UpdateSquashByIou;
