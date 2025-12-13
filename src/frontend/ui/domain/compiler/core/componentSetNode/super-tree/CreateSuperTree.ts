import { RenderTree, SuperTreeNode } from "@compiler";
import SpecDataManager from "@compiler/manager/SpecDataManager";
import NodeMatcher from "@compiler/core/NodeMatcher";
import { getNodesAtDepth, traverseBFS } from "@compiler/utils/traverse";
import debug from "@compiler/manager/DebuggingManager";
import _SortNodes from "@compiler/core/componentSetNode/super-tree/_SortNodes";
import {
  UnionFind,
  buildOrderGraphFromComponents,
  determineSquashStrategy,
} from "../../../manager/HelperManager";

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
    // 1. 원본 components로 방향 그래프 구축

    let superTree = components
      .map((comp) => this._convertSuperTreeNode(comp, null, comp.name)!)
      .reduce((superTree, target) => this._mergeTree(superTree, target));

    superTree = this.updateSquashByIou(superTree, components);
    debugger;
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

    // 4. 원본 components로 방향 그래프 구축 (한 번만 호출)
    const { graphs } = buildOrderGraphFromComponents(components);

    // ========== DEBUG 1: 스쿼시 대상 그룹들 확인 ==========
    console.log("===== 스쿼시 대상 그룹들 =====");
    for (const [rootId, groupNodes] of groups) {
      if (groupNodes.length > 1) {
        console.log(
          `그룹 [${rootId}]:`,
          groupNodes.map((n) => ({
            id: n.id,
            type: n.type,
            name: n.name,
            parentId: n.parent?.id,
            parentName: n.parent?.name,
          }))
        );
      }
    }

    // ========== DEBUG 2: 방향 그래프 확인 ==========
    console.log("===== 방향 그래프 =====");
    for (const [parentId, graph] of graphs) {
      console.log(`부모 ${parentId}:`, graph.getEdges());
    }

    // 5. 스쿼시 대상 그룹들 처리 (2개 이상인 그룹만)
    for (const [_, groupNodes] of groups) {
      if (groupNodes.length <= 1) continue;

      // 모든 노드 쌍에 대해 스쿼시 가능 여부 확인
      const squashedNodes = new Set<string>(); // 이미 스쿼시된(제거된) 노드들

      for (let i = 0; i < groupNodes.length; i++) {
        for (let j = i + 1; j < groupNodes.length; j++) {
          const nodeA = groupNodes[i];
          const nodeB = groupNodes[j];

          // 이미 스쿼시된 노드는 스킵
          if (squashedNodes.has(nodeA.id) || squashedNodes.has(nodeB.id)) {
            continue;
          }

          // 스쿼시 방향 결정
          const result = determineSquashStrategy(
            graphs,
            { id: nodeA.id, parentId: nodeA.parent?.id || "" },
            { id: nodeB.id, parentId: nodeB.parent?.id || "" }
          );

          // ========== DEBUG 3: 스쿼시 방향 결정 결과 ==========
          console.log("===== 스쿼시 방향 결정 =====");
          console.log(
            `nodeA: ${nodeA.id} (${nodeA.type}, parent: ${nodeA.parent?.id})`
          );
          console.log(
            `nodeB: ${nodeB.id} (${nodeB.type}, parent: ${nodeB.parent?.id})`
          );
          console.log("결과:", result);

          if (!result.canSquash) {
            console.log("→ 스쿼시 불가, skip");
            continue;
          }

          // 방향에 따라 스쿼시 수행
          let nodeToKeep: SuperTreeNode;
          let nodeToRemove: SuperTreeNode;

          switch (result.direction) {
            case "A_TO_B": // nodeA를 nodeB로 합침
              nodeToKeep = nodeB;
              nodeToRemove = nodeA;
              break;
            case "B_TO_A": // nodeB를 nodeA로 합침
              nodeToKeep = nodeA;
              nodeToRemove = nodeB;
              break;
            case "BOTH_OK":
            default: {
              // 1. depth가 더 깊은 쪽을 유지 (더 구체적인 위치)
              const getDepth = (node: SuperTreeNode): number => {
                let depth = 0;
                let current = node.parent;
                while (current) {
                  depth++;
                  current = current.parent;
                }
                return depth;
              };
              const depthA = getDepth(nodeA);
              const depthB = getDepth(nodeB);

              if (depthB > depthA) {
                nodeToKeep = nodeB;
                nodeToRemove = nodeA;
              } else if (depthA > depthB) {
                nodeToKeep = nodeA;
                nodeToRemove = nodeB;
              } else {
                // depth가 같으면 sibling이 많은 쪽을 유지
                const siblingCountA = nodeA.parent?.children.length || 0;
                const siblingCountB = nodeB.parent?.children.length || 0;
                if (siblingCountB > siblingCountA) {
                  nodeToKeep = nodeB;
                  nodeToRemove = nodeA;
                } else {
                  nodeToKeep = nodeA;
                  nodeToRemove = nodeB;
                }
              }
              break;
            }
          }

          // ========== DEBUG 4: 스쿼시 실행 ==========
          console.log(
            `→ 스쿼시 실행: ${nodeToRemove.id}를 ${nodeToKeep.id}로 합침`
          );

          // 실제 스쿼시 수행
          this.squashNode(nodeToRemove, nodeToKeep);
          squashedNodes.add(nodeToRemove.id);
        }
      }
    }

    return superTree;
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

    // 3. nodeToRemove의 children을 nodeToKeep으로 병합
    // (동일한 자식이 있으면 재귀적으로 스쿼시, 없으면 추가)
    for (const childToMove of nodeToRemove.children) {
      if (!childToMove) continue;

      // nodeToKeep의 children 중 동일한 노드 찾기
      const matchingChild = nodeToKeep.children.find(
        (keepChild) =>
          keepChild && this.matcher.isSameNode(childToMove, keepChild)
      );

      if (matchingChild) {
        // 동일한 자식이 있으면 재귀적으로 스쿼시
        this.squashNode(childToMove, matchingChild);
      } else {
        // 동일한 자식이 없으면 nodeToKeep의 children에 추가
        childToMove.parent = nodeToKeep;
        nodeToKeep.children.push(childToMove);
      }
    }
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
