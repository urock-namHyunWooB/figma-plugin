import { RenderTree, SiblingGraph, SuperTreeNode } from "@compiler";
import { traverseBFS } from "@compiler/utils/traverse";
import NodeMatcher from "../../NodeMatcher";
import SpecDataManager from "@compiler/manager/SpecDataManager";
import helper from "@compiler/manager/HelperManager";

class UpdateSquashByIou {
  private static readonly INSTANCE_ID_PREFIX = "I";
  private static readonly IOU_THRESHOLD = 0.5;

  private matcher: NodeMatcher;
  private specDataManager: SpecDataManager;

  constructor(matcher: NodeMatcher, specDataManager: SpecDataManager) {
    this.matcher = matcher;
    this.specDataManager = specDataManager;
  }

  public updateSquashByIou(
    superTree: SuperTreeNode,
    _components: RenderTree[]
  ) {
    const { nodesByType } = this.groupNodesByType(superTree);
    const squashGroups = this.findSquashGroups(nodesByType);

    const filteredSquashGroups = squashGroups.filter((group) =>
      this.isValidSquashGroup(group)
    );

    const siblingGraph = this.createNodeSiblingGraph(_components);

    filteredSquashGroups.forEach((group) => {
      const [nodeA, nodeB] = group;

      this.squashNodeByTopoSort(superTree, nodeA, nodeB, siblingGraph);
    });

    return superTree;
  }

  /** 스쿼시 그룹이 유효한지 검증 */
  private isValidSquashGroup(group: SuperTreeNode[]): boolean {
    const [nodeA, nodeB] = group;
    const specA = this.specDataManager.getSpecById(nodeA.id);
    const specB = this.specDataManager.getSpecById(nodeB.id);

    if (this.isMaskedSpec(specA) || this.isMaskedSpec(specB)) {
      return false;
    }

    if (!this.isInstanceChildren(specA, specB)) {
      return false;
    }

    if (this.hasParentWithMask(nodeA) || this.hasParentWithMask(nodeB)) {
      return false;
    }

    if (this.isAncestorDescendant(nodeA, nodeB)) {
      return false;
    }

    return true;
  }

  /** spec이 마스크인지 확인 */
  private isMaskedSpec(spec: unknown): boolean {
    return (
      typeof spec === "object" &&
      spec !== null &&
      "isMask" in spec &&
      (spec as { isMask?: boolean }).isMask === true
    );
  }

  /**
   * 인스턴스의 자식요소인지?
   * 한쪽만 인스턴스 자식요소 이면 스쿼시 할 수 없음.
   * */
  private isInstanceChildren(
    specA: { id: string },
    specB: { id: string }
  ): boolean {
    const isInstanceA = specA.id.startsWith(
      UpdateSquashByIou.INSTANCE_ID_PREFIX
    );
    const isInstanceB = specB.id.startsWith(
      UpdateSquashByIou.INSTANCE_ID_PREFIX
    );

    // 둘 다 인스턴스가 아니면 OK
    if (!isInstanceA && !isInstanceB) return true;

    // 둘 다 인스턴스여야 OK
    return isInstanceA && isInstanceB;
  }

  /**
   * 조상-자식 관계인지 확인
   * @param nodeA
   * @param nodeB
   */
  private isAncestorDescendant(nodeA: SuperTreeNode, nodeB: SuperTreeNode) {
    // nodeA가 nodeB의 조상인지 확인
    let current: SuperTreeNode | null = nodeB.parent;
    while (current) {
      if (current.id === nodeA.id) {
        return true;
      }
      current = current.parent;
    }

    // nodeB가 nodeA의 조상인지 확인
    current = nodeA.parent;
    while (current) {
      if (current.id === nodeB.id) {
        return true;
      }
      current = current.parent;
    }

    return false;
  }

  /** 부모 체인에 마스크가 있는지 확인 (COMPONENT 노드까지) */
  private hasParentWithMask(node: SuperTreeNode): boolean {
    let parent = node.parent;

    while (parent) {
      if (this.isMaskedSpec(parent.metaData.spec)) {
        return true;
      }

      if (parent.type === "COMPONENT") {
        break;
      }

      parent = parent.parent ?? null;
    }

    return false;
  }

  /** 타입별로 노드 그룹핑 */
  private groupNodesByType(superTree: SuperTreeNode) {
    const nodesByType = new Map<string, SuperTreeNode[]>();

    traverseBFS(superTree, (node) => {
      if (!nodesByType.has(node.type)) {
        nodesByType.set(node.type, []);
      }
      nodesByType.get(node.type)!.push(node);
    });

    return { nodesByType };
  }

  /** IOU 기반으로 스쿼시 대상 그룹 찾기 */
  private findSquashGroups(nodesByType: Map<string, SuperTreeNode[]>) {
    const squashTarget: SuperTreeNode[][] = [];

    // 같은 타입 내에서 IOU가 높은 노드들을 union
    for (const [_, nodes] of nodesByType) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const iou = this.matcher.getIou2(nodes[i], nodes[j]);
          if (iou !== null && iou >= UpdateSquashByIou.IOU_THRESHOLD) {
            squashTarget.push([nodes[i], nodes[j]]);
          }
        }
      }
    }

    return squashTarget;
  }

  private createNodeSiblingGraph(components: RenderTree[]): SiblingGraph {
    const siblingGraph: SiblingGraph = new Map();

    for (const component of components) {
      traverseBFS(component, (node, meta) => {
        const { depth, index, parent } = meta;
        const spec = this.specDataManager.getSpecById(node.id);
        if (!spec) {
          return;
        }
        const nodeKey = this.buildNodeKey(spec.type, depth, node.id);

        if (!siblingGraph.has(nodeKey)) {
          siblingGraph.set(nodeKey, []);
        }

        const nextSibling = parent?.children[index + 1];
        if (nextSibling) {
          siblingGraph.get(nodeKey)!.push(nextSibling);
        }
      });
    }

    return siblingGraph;
  }

  private buildNodeKey(type: string, depth: number, id: string) {
    return `${type}|${id}`;
  }

  /**
   * 위상정렬 기반 스쿼시
   * 양방향(A→B, B→A) 스쿼시 가능성을 검증하고, 한쪽만 유효할 때만 수행
   */
  private squashNodeByTopoSort(
    superTree: SuperTreeNode,
    nodeA: SuperTreeNode,
    nodeB: SuperTreeNode,
    siblingGraph: SiblingGraph
  ) {
    // 1. 양방향 스쿼시 가능성 검증
    const canSquashAIntoB = this.validateSquashDirection(
      superTree,
      nodeA,
      nodeB,
      siblingGraph
    );
    const canSquashBIntoA = this.validateSquashDirection(
      superTree,
      nodeB,
      nodeA,
      siblingGraph
    );

    // 2. 스쿼시 결정: 한쪽만 유효할 때만 수행
    const bothValid = canSquashAIntoB.isValid && canSquashBIntoA.isValid;
    const bothInvalid = !canSquashAIntoB.isValid && !canSquashBIntoA.isValid;

    if (bothValid || bothInvalid) {
      return superTree;
    }

    // 3. 유효한 방향으로 스쿼시 실행
    if (canSquashAIntoB.isValid) {
      this.performSquash(nodeA, nodeB);
    } else {
      this.performSquash(nodeB, nodeA);
    }

    return superTree;
  }

  /**
   * 특정 방향으로 스쿼시했을 때 위상정렬이 유효한지 검증
   * @param targetNode 스쿼시 대상 노드 (이 노드로 합침)
   * @param sourceNode 스쿼시 소스 노드 (이 노드가 사라짐)
   */
  private validateSquashDirection(
    superTree: SuperTreeNode,
    targetNode: SuperTreeNode,
    sourceNode: SuperTreeNode,
    siblingGraph: SiblingGraph
  ): { isValid: boolean; violations: any[] } {
    const clonedTree = helper.deepCloneTree(superTree) as SuperTreeNode;
    const clonedTarget = helper.findNodeById(clonedTree, targetNode.id)!;

    clonedTarget.mergedNode = [
      ...targetNode.mergedNode,
      ...sourceNode.mergedNode,
    ];

    return this.validateTopologicalOrder(clonedTarget, siblingGraph);
  }

  /**
   * 실제 스쿼시 수행: sourceNode를 targetNode로 병합
   */
  private performSquash(
    targetNode: SuperTreeNode,
    sourceNode: SuperTreeNode
  ): void {
    targetNode.mergedNode = [
      ...sourceNode.mergedNode,
      ...targetNode.mergedNode,
    ];

    if (sourceNode.parent) {
      sourceNode.parent.children = sourceNode.parent.children.filter(
        (child) => child !== sourceNode
      );
    }
  }

  private validateTopologicalOrder(
    superTree: SuperTreeNode,
    siblingGraph: SiblingGraph
  ) {
    const violations: any[] = [];

    traverseBFS(superTree, (node) => {
      for (const merged of node.mergedNode) {
        const violation = this.checkSiblingViolation(
          node,
          merged,
          siblingGraph
        );
        if (violation) {
          violations.push(violation);
        }
      }
    });

    return {
      isValid: violations.length === 0,
      violations,
    };
  }

  /** 형제 노드 순서 위반 검사 */
  private checkSiblingViolation(
    node: SuperTreeNode,
    merged: { id: string },
    siblingGraph: SiblingGraph
  ) {
    const savedSiblings = siblingGraph.get(this.buildNodeKeyById(merged.id));
    if (!savedSiblings?.length) return null;

    const savedNext = savedSiblings[0];
    const actualNext = helper.getNextSiblingNode(node);

    // 원래 다음 형제가 있었는데 현재는 없으면 위반
    if (!actualNext) {
      return {
        targetNode: node,
        detail: {
          invalidNode: this.specDataManager.getSpecById(merged.id),
          savedNextNode: savedNext,
          actualNextNode: null,
        },
      };
    }

    const savedType = this.specDataManager.getSpecById(savedNext.id).type;
    const actualType = this.specDataManager.getSpecById(actualNext.id).type;

    if (savedType === actualType) {
      const savedNextSpec = this.specDataManager.getSpecById(savedNext.id);
      const actualNextSpec = this.specDataManager.getSpecById(actualNext.id);

      return null;
    }

    return {
      targetNode: node,
      detail: {
        invalidNode: this.specDataManager.getSpecById(merged.id),
        savedNextNode: savedNext,
        actualNextNode: actualNext,
      },
    };
  }

  private buildNodeKeyById(id: string): string {
    const spec = this.specDataManager.getSpecById(id);
    return `${spec.type}|${id}`;
  }
}

export default UpdateSquashByIou;
