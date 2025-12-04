import { RenderTree } from "@compiler";
import SpecDataManager from "@compiler/manager/SpecDataManager";
import { toCamelCase } from "@compiler/utils/normalizeString";
import { getNodesAtDepth, traverseBFS } from "@compiler/utils/traverse";
import NodeMatcher from "@compiler/core/NodeMatcher";

type PropsDef = Record<string, any>;

type SuperTreeNode = {
  id: string;
  type: string;
  name: string;
  parent: SuperTreeNode | null;
  children: (SuperTreeNode | undefined)[];
};

class ComponentSetCompiler {
  public readonly superTree: SuperTreeNode;

  private renderTree: RenderTree;
  private specDataManager: SpecDataManager;
  private matcher: NodeMatcher;

  private propsDef: PropsDef;

  constructor(
    renderTree: RenderTree,
    specDataManager: SpecDataManager,
    matcher: NodeMatcher
  ) {
    this.renderTree = renderTree;
    this.specDataManager = specDataManager;
    this.matcher = matcher;

    this.propsDef = this.extractPropsDef();
    //TODO 구조에 따라서 슈퍼트리, 슬롯 + 레이아웃 전략을 한다.

    this.superTree = this.createSuperTree();
  }

  private extractPropsDef() {
    const props = {} as PropsDef;

    const nodeData = this.specDataManager.getSpecById(
      this.renderTree.id
    ) as ComponentSetNode;

    const componentPropertyDefinitions = nodeData.componentPropertyDefinitions;

    Object.entries(componentPropertyDefinitions).forEach(([key, value]) => {
      props[toCamelCase(key)] = value;
    });

    return props;
  }

  /**
   * 각 variants가 주어지면 노드 style이 어떤식으로 바뀌어야하는지 나타내는 맵
   * @private
   */
  private createVariantStyleMap() {}

  /**
   * 모든 컴포넌트 구조를 표현할 수 있는 슈퍼트리를 만듭니다.
   * @private
   */
  private createSuperTree() {
    const components = this.renderTree.children;
    // const superTreeRoot = this._makeSuperTreeNode(this.renderTree);

    let superTree = this._makeSuperTreeNode(components[0])!;

    for (let i = 1; i < components.length; i++) {
      const target = this._makeSuperTreeNode(components[i])!;

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
   * 순서 정렬
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

      const matchedNode = sameDepthNodes.find((pivot) => {
        return this.matcher.isSameNode(targetNode, pivot);
      });

      if (matchedNode) return; // 이미 존재하면 스킵

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

  private _makeSuperTreeNode(
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
    };

    node.children = renderTree.children.map((child) =>
      this._makeSuperTreeNode(child, node)
    );

    return node;
  }
}

export default ComponentSetCompiler;
