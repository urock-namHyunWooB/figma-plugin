import {
  UITree,
  UINode,
  FigmaNodeData,
  InternalTree,
  InternalNode,
  PropDefinition,
  VariantProps,
  VariantGraph,
  VariantGraphNode,
  VariantGraphEdge,
  PropDiffInfo,
} from "../../../types/types";
import DataManager from "../../data-manager/DataManager";

/**
 * 개별 컴포넌트의 UITree를 빌드하는 역할
 * 복잡한 변환 파이프라인 담당
 */
class TreeBuilder {
  private readonly dataManager: DataManager;

  /** 노드 ID → 원본 variant 루트 ID 매핑 (v1 방식) */
  private nodeToVariantRoot: Map<string, string> = new Map();

  constructor(dataManager: DataManager) {
    this.dataManager = dataManager;
  }

  /**
   * FigmaNodeData → UITree 변환
   *
   * 파이프라인:
   * Step 1: 변형 병합 (buildInternalTree)
   * Step 2: Props 추출/바인딩
   * Step 3: 스타일 처리
   * Step 4: 가시성 조건
   * Step 5: 외부 참조
   */
  public build(spec: FigmaNodeData): UITree {
    const document = spec.info.document;

    // Step 1: 변형 병합
    let tree = this.buildInternalTree(document);

    // Step 2: Props 추출/바인딩
    const props = this.extractProps(spec, tree);

    // Step 3: 스타일 처리
    tree = this.applyStyles(tree);

    // Step 4: 가시성 조건
    tree = this.applyVisibility(tree);

    // Step 5: 외부 참조
    tree = this.resolveExternalRefs(tree);

    // InternalTree → UINode 변환
    const root = this.convertToUINode(tree);

    return {
      root,
      props,
    };
  }

  /**
   * 디버그용: InternalTree 반환 (Step 1 결과)
   */
  public buildInternalTreeDebug(spec: FigmaNodeData): InternalTree {
    return this.buildInternalTree(spec.info.document);
  }

  // ===========================================================================
  // Step 1: 변형 병합
  // ===========================================================================

  /**
   * SceneNode → InternalTree 변환
   * COMPONENT_SET인 경우 여러 variant를 병합
   */
  private buildInternalTree(document: SceneNode): InternalTree {
    if (document.type === "COMPONENT_SET") {
      const children = (document as any).children as SceneNode[] | undefined;

      if (!children || children.length === 0) {
        return this.convertToInternalTree(document);
      }

      // 노드 ID → 원본 variant 루트 ID 매핑 구축 (v1 방식)
      this.buildNodeToVariantRootMap(children);

      // Variant 그래프 구축 (1-prop 차이 기반)
      const graph = this.buildVariantGraph(children);

      // 병합 순서 결정 (BFS)
      const mergeOrder = this.determineMergeOrder(graph);

      // 순서대로 병합 (1-prop 차이 우선)
      let merged = graph.nodes[mergeOrder[0]].tree;
      let prevProps = graph.nodes[mergeOrder[0]].props;

      for (let i = 1; i < mergeOrder.length; i++) {
        const currentProps = graph.nodes[mergeOrder[i]].props;
        const nextTree = graph.nodes[mergeOrder[i]].tree;

        // 현재 병합된 트리와 다음 트리의 prop 차이 계산
        const propDiff = this.calculatePropDiff(prevProps, currentProps);

        merged = this.mergeTwoTrees(merged, nextTree, propDiff);

        // 다음 반복을 위해 props 업데이트
        prevProps = currentProps;
      }

      // Children을 x 좌표 기준으로 정렬 (v1 방식)
      this.sortChildrenByPosition(merged);

      // 루트 이름을 컴포넌트 세트 이름으로 설정
      merged.name = document.name;

      return merged;
    } else {
      return this.convertToInternalTree(document);
    }
  }

  /**
   * SceneNode → InternalTree 변환 (단일 variant)
   */
  private convertToInternalTree(
    node: SceneNode,
    variantName?: string
  ): InternalTree {
    const children = (node as any).children as SceneNode[] | undefined;
    const bounds = (node as any).absoluteBoundingBox as
      | { x: number; y: number; width: number; height: number }
      | undefined;

    return {
      id: node.id,
      type: node.type,
      name: node.name,
      children: children
        ? children.map((child) =>
            this.convertToInternalTree(child, variantName)
          )
        : [],
      mergedNodes: [
        {
          id: node.id,
          name: node.name,
          variantName,
        },
      ],
      bounds,
    };
  }

  /**
   * Variant 이름에서 prop 파싱
   * 예: "State=Default, hasIcon=true" → { State: "Default", hasIcon: "true" }
   */
  private parseVariantProps(variantName: string): VariantProps {
    const props: VariantProps = {};

    // 쉼표로 분리
    const parts = variantName.split(",").map((s) => s.trim());

    for (const part of parts) {
      // "key=value" 형식 파싱
      const eqIndex = part.indexOf("=");
      if (eqIndex === -1) continue;

      const key = part.substring(0, eqIndex).trim();
      const value = part.substring(eqIndex + 1).trim();

      if (key && value) {
        props[key] = value;
      }
    }

    return props;
  }

  /**
   * 두 variant의 prop 차이 개수 계산
   */
  private countPropDiff(propsA: VariantProps, propsB: VariantProps): number {
    const keysA = Object.keys(propsA);
    const keysB = Object.keys(propsB);

    // 키 집합이 다르면 무한대 (비교 불가)
    if (keysA.length !== keysB.length) {
      return Infinity;
    }

    const allKeys = new Set([...keysA, ...keysB]);
    if (allKeys.size !== keysA.length) {
      return Infinity;
    }

    // 값 차이 개수 카운트
    let diff = 0;
    for (const key of keysA) {
      if (propsA[key] !== propsB[key]) {
        diff++;
      }
    }

    return diff;
  }

  /**
   * 두 variant의 prop 차이 상세 정보 계산
   */
  private calculatePropDiff(
    propsA: VariantProps,
    propsB: VariantProps
  ): PropDiffInfo {
    const keysA = Object.keys(propsA);
    const keysB = Object.keys(propsB);

    // 키 집합이 다르면 비교 불가
    if (keysA.length !== keysB.length) {
      return { diffCount: Infinity };
    }

    const allKeys = new Set([...keysA, ...keysB]);
    if (allKeys.size !== keysA.length) {
      return { diffCount: Infinity };
    }

    // 값 차이 개수 카운트 및 차이 정보 수집
    let diff = 0;
    let diffPropName: string | undefined;
    let diffPropValueA: string | undefined;
    let diffPropValueB: string | undefined;

    for (const key of keysA) {
      if (propsA[key] !== propsB[key]) {
        diff++;
        if (diff === 1) {
          // 첫 번째 차이 저장
          diffPropName = key;
          diffPropValueA = propsA[key];
          diffPropValueB = propsB[key];
        }
      }
    }

    return {
      diffCount: diff,
      diffPropName,
      diffPropValueA,
      diffPropValueB,
    };
  }

  /**
   * Variant 그래프 구축
   * 1-prop 차이 쌍을 엣지로 연결, 끊기면 2-prop 차이 엣지 추가
   */
  private buildVariantGraph(variants: SceneNode[]): VariantGraph {
    // 각 variant를 노드로 변환
    const nodes: VariantGraphNode[] = variants.map((variant) => ({
      variantName: variant.name,
      props: this.parseVariantProps(variant.name),
      tree: this.convertToInternalTree(variant, variant.name),
    }));

    const edges: VariantGraphEdge[] = [];

    // 모든 쌍에 대해 prop 차이 계산
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const diff = this.countPropDiff(nodes[i].props, nodes[j].props);

        // 1-prop 차이는 즉시 엣지 추가
        if (diff === 1) {
          edges.push({ from: i, to: j, propDiff: 1 });
        }
      }
    }

    // 연결 컴포넌트 확인 (BFS)
    const visited = new Set<number>();
    const queue = [0];
    visited.add(0);

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const edge of edges) {
        const neighbor =
          edge.from === current ? edge.to : edge.to === current ? edge.from : -1;
        if (neighbor !== -1 && !visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    // 그래프가 끊긴 경우, 2-prop 차이 엣지 추가
    if (visited.size < nodes.length) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const diff = this.countPropDiff(nodes[i].props, nodes[j].props);
          if (diff === 2) {
            edges.push({ from: i, to: j, propDiff: 2 });
          }
        }
      }
    }

    return { nodes, edges };
  }

  /**
   * 병합 순서 결정 (BFS, 1-prop 차이 엣지 우선)
   */
  private determineMergeOrder(graph: VariantGraph): number[] {
    if (graph.nodes.length === 0) {
      return [];
    }

    const order: number[] = [];
    const visited = new Set<number>();
    const queue = [0]; // 첫 번째 variant부터 시작
    visited.add(0);
    order.push(0);

    while (queue.length > 0) {
      const current = queue.shift()!;

      // 1-prop 차이 엣지 우선
      const neighbors = graph.edges
        .filter((e) => e.from === current || e.to === current)
        .sort((a, b) => a.propDiff - b.propDiff) // propDiff 오름차순
        .map((e) => (e.from === current ? e.to : e.from))
        .filter((n) => !visited.has(n));

      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
          order.push(neighbor);
        }
      }
    }

    // 끊긴 노드가 있으면 추가 (폴백)
    for (let i = 0; i < graph.nodes.length; i++) {
      if (!visited.has(i)) {
        order.push(i);
      }
    }

    return order;
  }

  /**
   * 두 InternalTree를 병합
   */
  private mergeTwoTrees(
    treeA: InternalTree,
    treeB: InternalTree,
    propDiff: PropDiffInfo
  ): InternalTree {
    return {
      ...treeA,
      mergedNodes: [...(treeA.mergedNodes || []), ...(treeB.mergedNodes || [])],
      children: this.mergeChildren(treeA.children, treeB.children, propDiff),
    };
  }

  /**
   * children 배열 병합 (Hybrid 방식)
   *
   * v1 로직을 사용하여 안정적으로 매칭:
   * 1. 타입 + ID + 위치로 매칭 (원본 variant 루트 기준)
   * 2. TEXT 노드는 이름으로 매칭
   */
  private mergeChildren(
    childrenA: InternalNode[],
    childrenB: InternalNode[],
    propDiff: PropDiffInfo
  ): InternalNode[] {
    const merged: InternalNode[] = [...childrenA];
    const usedIndices = new Set<number>();

    for (const childB of childrenB) {
      // v1 로직: 타입 + ID + 위치 + 이름(TEXT) 매칭
      const matchIdx = merged.findIndex(
        (childA, idx) =>
          !usedIndices.has(idx) && this.isSameNode(childA, childB)
      );

      if (matchIdx !== -1) {
        // 매칭 성공: mergedNodes에 추가
        const matchedNode = merged[matchIdx];
        usedIndices.add(matchIdx);

        matchedNode.mergedNodes = [
          ...(matchedNode.mergedNodes || []),
          ...(childB.mergedNodes || []),
        ];

        // 재귀적으로 children 병합
        matchedNode.children = this.mergeChildren(
          matchedNode.children,
          childB.children,
          propDiff
        );
      } else {
        // 매칭 실패: 새 노드 추가
        merged.push(childB);
      }
    }

    return merged;
  }

  /**
   * 트리 전체의 children을 x 좌표 기준으로 정렬 (재귀)
   * v1 방식: 가로 배치 시 올바른 순서 보장
   */
  private sortChildrenByPosition(node: InternalNode): void {
    // children을 정규화된 x 좌표로 정렬
    node.children.sort((a, b) => {
      const aX = this.getAverageX(a);
      const bX = this.getAverageX(b);
      return aX - bX;
    });

    // 재귀적으로 자식 노드들도 정렬
    for (const child of node.children) {
      this.sortChildrenByPosition(child);
    }
  }

  /**
   * 노드의 평균 정규화된 x 좌표 계산
   * mergedNodes의 각 원본 노드에서 variant 루트 기준 정규화된 x를 계산하고 평균
   */
  private getAverageX(node: InternalNode): number {
    if (!node.mergedNodes || node.mergedNodes.length === 0) {
      return 0;
    }

    let totalNormalizedX = 0;
    let count = 0;

    for (const merged of node.mergedNodes) {
      const { node: originalNode } = this.dataManager.getById(merged.id);
      const nodeBounds = originalNode?.absoluteBoundingBox as
        | { x: number; y: number; width: number; height: number }
        | undefined;

      if (!nodeBounds) continue;

      // 원본 variant 루트 찾기
      const variantRootId = this.nodeToVariantRoot.get(merged.id);
      if (!variantRootId) continue;

      const { node: variantRoot } = this.dataManager.getById(variantRootId);
      const rootBounds = variantRoot?.absoluteBoundingBox as
        | { x: number; y: number; width: number; height: number }
        | undefined;

      if (!rootBounds || rootBounds.width === 0) continue;

      // 정규화된 x 계산 (0~1 범위)
      const normalizedX = (nodeBounds.x - rootBounds.x) / rootBounds.width;
      totalNormalizedX += normalizedX;
      count++;
    }

    return count > 0 ? totalNormalizedX / count : 0;
  }

  /**
   * 두 노드가 같은 노드인지 확인 (v1의 isSameInternalNode 로직)
   *
   * 1. 타입 체크
   * 2. ID 체크
   * 3. 정규화된 위치 비교 (±0.1) - 원본 variant 루트 기준
   * 4. TEXT 노드는 이름 매칭
   */
  /**
   * 두 InternalNode가 같은 노드인지 확인 (v1 방식)
   *
   * 1차: 정규화된 좌표 비교 (0.1 이내면 같은 노드)
   * 2차: TEXT 노드만 이름 기반 매칭 (size variant에서 같은 텍스트 병합)
   */
  private isSameNode(
    nodeA: InternalNode,
    nodeB: InternalNode
  ): boolean {
    // 타입이 다르면 다른 노드
    if (nodeA.type !== nodeB.type) {
      return false;
    }

    // 같은 ID면 같은 노드
    if (nodeA.id === nodeB.id) {
      return true;
    }

    // 부모가 없으면 (루트) → 루트끼리는 같음
    if (!nodeA.parent && !nodeB.parent) {
      return true;
    }

    // 1차: 정규화된 좌표(시작점) 비교
    const posA = this.getNormalizedPosition(nodeA);
    const posB = this.getNormalizedPosition(nodeB);

    if (posA && posB) {
      const posMatch =
        Math.abs(posA.x - posB.x) <= 0.1 && Math.abs(posA.y - posB.y) <= 0.1;
      if (posMatch) {
        return true;
      }
    }

    // 2차: TEXT 노드만 이름 기반 매칭
    // size variant에서 같은 텍스트가 다른 위치에 있어도 병합되도록
    // 단, 부모 타입이 같아야 함 (다른 구조의 같은 이름 텍스트 구분)
    if (nodeA.type === "TEXT" && nodeA.name === nodeB.name) {
      const parentAType = nodeA.parent?.type;
      const parentBType = nodeB.parent?.type;
      // 부모 타입이 같으면 같은 역할의 텍스트로 간주
      if (parentAType && parentBType && parentAType === parentBType) {
        return true;
      }
    }

    return false;
  }

  /**
   * 노드의 정규화된 위치 계산 (원본 variant 루트 기준, v1 방식)
   *
   * nodeToVariantRoot 맵을 사용해서 원본 variant 루트를 찾고
   * 해당 루트 기준으로 0~1 범위로 정규화
   */
  private getNormalizedPosition(
    node: InternalNode
  ): { x: number; y: number } | null {
    if (!node.bounds || !node.mergedNodes || node.mergedNodes.length === 0) {
      return null;
    }

    // 첫 번째 mergedNode의 ID로 원본 variant 루트 찾기
    const originalId = node.mergedNodes[0].id;
    const variantRoot = this.findOriginalVariantRoot(originalId);

    if (!variantRoot) {
      return null;
    }

    const rootBounds = (variantRoot as any).absoluteBoundingBox as
      | { x: number; y: number; width: number; height: number }
      | undefined;

    if (!rootBounds) {
      return null;
    }

    // 정규화된 위치 계산
    return {
      x: (node.bounds.x - rootBounds.x) / rootBounds.width,
      y: (node.bounds.y - rootBounds.y) / rootBounds.height,
    };
  }

  /**
   * 노드 ID → 원본 variant 루트 ID 매핑 구축 (v1 방식)
   *
   * 각 variant의 모든 자식 노드를 순회하면서
   * 해당 노드 ID를 variant 루트 ID와 매핑
   */
  private buildNodeToVariantRootMap(variants: SceneNode[]): void {
    this.nodeToVariantRoot.clear();

    const traverse = (node: SceneNode, variantRootId: string) => {
      this.nodeToVariantRoot.set(node.id, variantRootId);
      const children = (node as any).children as SceneNode[] | undefined;
      if (children) {
        for (const child of children) {
          traverse(child, variantRootId);
        }
      }
    };

    for (const variant of variants) {
      traverse(variant, variant.id);
    }
  }

  /**
   * 노드 ID로 원본 variant 루트 찾기 (v1 방식)
   */
  private findOriginalVariantRoot(nodeId: string): SceneNode | null {
    const variantRootId = this.nodeToVariantRoot.get(nodeId);
    if (!variantRootId) {
      return null;
    }

    const { node } = this.dataManager.getById(variantRootId);
    return node || null;
  }

  /**
   * 위치 기반으로 children 병합
   * State/Size prop 차이일 때: 구조 동일 → 위치 매칭
   */
  private mergeChildrenWithPosition(
    childrenA: InternalNode[],
    childrenB: InternalNode[],
    propDiff: PropDiffInfo,
    parentBoundsA?: InternalNode["bounds"],
    parentBoundsB?: InternalNode["bounds"]
  ): InternalNode[] {
    const merged: InternalNode[] = [];
    const usedB = new Set<number>();

    for (const childA of childrenA) {
      // 1. name 매칭 시도
      const nameMatchIdx = childrenB.findIndex(
        (childB, idx) => !usedB.has(idx) && childB.name === childA.name
      );

      if (nameMatchIdx !== -1) {
        usedB.add(nameMatchIdx);
        merged.push({
          ...childA,
          mergedNodes: [
            ...(childA.mergedNodes || []),
            ...(childrenB[nameMatchIdx].mergedNodes || []),
          ],
          children: this.mergeChildren(
            childA.children,
            childrenB[nameMatchIdx].children,
            propDiff
          ),
        });
      } else {
        // 2. 위치 + type 매칭 시도 (isSameNode 사용)
        const positionMatchIdx = childrenB.findIndex(
          (childB, idx) =>
            !usedB.has(idx) &&
            this.isSameNode(childA, childB)
        );

        if (positionMatchIdx !== -1) {
          usedB.add(positionMatchIdx);
          merged.push({
            ...childA,
            mergedNodes: [
              ...(childA.mergedNodes || []),
              ...(childrenB[positionMatchIdx].mergedNodes || []),
            ],
            children: this.mergeChildren(
              childA.children,
              childrenB[positionMatchIdx].children,
              propDiff
            ),
          });
        } else {
          // 매칭 실패: childrenA에만 존재
          merged.push(childA);
        }
      }
    }

    // childrenB에만 존재하는 노드 추가
    childrenB.forEach((childB, idx) => {
      if (!usedB.has(idx)) {
        merged.push(childB);
      }
    });

    return merged;
  }

  /**
   * 소거법으로 children 병합
   * Boolean prop 차이일 때: 노드 1개 추가/제거 → 소거법으로 매칭
   */
  private mergeChildrenWithElimination(
    childrenA: InternalNode[],
    childrenB: InternalNode[],
    propDiff: PropDiffInfo,
    _parentBoundsA?: InternalNode["bounds"],
    _parentBoundsB?: InternalNode["bounds"]
  ): InternalNode[] {
    const merged: InternalNode[] = [];
    const usedB = new Set<number>();

    // childrenA의 각 노드에 대해 childrenB에서 매칭 찾기
    for (const childA of childrenA) {
      // 1. name 기반 매칭 시도
      const nameMatchIdx = childrenB.findIndex(
        (childB, idx) => !usedB.has(idx) && childB.name === childA.name
      );

      if (nameMatchIdx !== -1) {
        // name 매칭 성공
        usedB.add(nameMatchIdx);
        merged.push({
          ...childA,
          mergedNodes: [
            ...(childA.mergedNodes || []),
            ...(childrenB[nameMatchIdx].mergedNodes || []),
          ],
          children: this.mergeChildren(
            childA.children,
            childrenB[nameMatchIdx].children,
            propDiff
          ),
        });
      } else {
        // 2. 소거법: type 기반 매칭
        const typeMatchIdx = childrenB.findIndex(
          (childB, idx) => !usedB.has(idx) && childB.type === childA.type
        );

        if (typeMatchIdx !== -1) {
          usedB.add(typeMatchIdx);
          merged.push({
            ...childA,
            mergedNodes: [
              ...(childA.mergedNodes || []),
              ...(childrenB[typeMatchIdx].mergedNodes || []),
            ],
            children: this.mergeChildren(
              childA.children,
              childrenB[typeMatchIdx].children,
              propDiff
            ),
          });
        } else {
          // 매칭 실패: childrenA에만 존재하는 노드
          merged.push(childA);
        }
      }
    }

    // childrenB에만 존재하는 노드 추가
    childrenB.forEach((childB, idx) => {
      if (!usedB.has(idx)) {
        merged.push(childB);
      }
    });

    return merged;
  }

  // ===========================================================================
  // Step 2: Props 추출/바인딩
  // ===========================================================================

  private extractProps(
    _spec: FigmaNodeData,
    _tree: InternalTree
  ): PropDefinition[] {
    // TODO: 구현
    return [];
  }

  // ===========================================================================
  // Step 3: 스타일 처리
  // ===========================================================================

  private applyStyles(tree: InternalTree): InternalTree {
    // TODO: 구현
    return tree;
  }

  // ===========================================================================
  // Step 4: 가시성 조건
  // ===========================================================================

  private applyVisibility(tree: InternalTree): InternalTree {
    // TODO: 구현
    return tree;
  }

  // ===========================================================================
  // Step 5: 외부 참조
  // ===========================================================================

  private resolveExternalRefs(tree: InternalTree): InternalTree {
    // TODO: 구현
    return tree;
  }

  // ===========================================================================
  // InternalTree → UINode 변환
  // ===========================================================================

  private convertToUINode(node: InternalNode): UINode {
    const children = node.children.map((child) => this.convertToUINode(child));

    // 기본적으로 container로 매핑 (타입 매핑은 휴리스틱에서)
    return {
      type: "container",
      id: node.id,
      name: node.name,
      styles: node.styles || { base: {}, dynamic: [] },
      visibleCondition: node.visibleCondition,
      bindings: node.bindings,
      children,
    };
  }
}

export default TreeBuilder;
