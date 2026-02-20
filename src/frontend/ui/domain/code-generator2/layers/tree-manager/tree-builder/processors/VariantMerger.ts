import {
  InternalTree,
  InternalNode,
  VariantGraph,
  PropDiffInfo,
} from "../../../../types/types";
import DataManager from "../../../data-manager/DataManager";
import { NodeMatcher } from "./NodeMatcher";
import { VariantGraphBuilder } from "./VariantGraphBuilder";

/**
 * VariantMerger
 *
 * 여러 variant를 하나의 InternalTree로 병합하는 오케스트레이터
 *
 * 고수준 파이프라인:
 * 1. 준비: nodeToVariantRoot 매핑
 * 2. 그래프: variant 그래프 구축 및 순서 결정
 * 3. 병합: 순서대로 트리 병합
 * 4. 정렬: children x 좌표 정렬
 * 5. 완료: 루트 이름 설정
 */
export class VariantMerger {
  private readonly dataManager: DataManager;
  private readonly graphBuilder: VariantGraphBuilder;

  /** 노드 ID → 원본 variant 루트 ID 매핑 */
  private nodeToVariantRoot: Map<string, string> = new Map();

  /** 노드 매칭 로직 (병합 시점에 생성) */
  private nodeMatcher?: NodeMatcher;

  constructor(dataManager: DataManager) {
    this.dataManager = dataManager;
    this.graphBuilder = new VariantGraphBuilder();
  }

  /**
   * 파이프라인 진입점
   */
  public merge(document: SceneNode): InternalTree {
    if (document.type === "COMPONENT_SET") {
      const children = (document as any).children as SceneNode[] | undefined;

      if (!children || children.length === 0) {
        return this.convertToInternalTree(document);
      }

      return this.mergeVariants(document, children);
    } else {
      return this.convertToInternalTree(document);
    }
  }

  /**
   * COMPONENT_SET의 여러 variant 병합 (고수준 흐름)
   */
  private mergeVariants(
    document: SceneNode,
    variants: SceneNode[]
  ): InternalTree {
    // 1. 준비: nodeToVariantRoot 매핑
    this.prepareVariantMapping(variants);

    // 2. 그래프: variant 그래프 구축 및 순서 결정
    const { graph, mergeOrder } = this.buildGraphAndOrder(variants);

    // 3. 병합: 순서대로 트리 병합
    const merged = this.mergeTreesInOrder(graph, mergeOrder);

    // 4. 정렬: children x 좌표 정렬
    this.sortChildrenByPosition(merged);

    // 5. 완료: 루트 이름 설정
    merged.name = document.name;

    return merged;
  }

  // ===========================================================================
  // Private: 1단계 - 준비
  // ===========================================================================

  /**
   * 노드 ID → variant 루트 매핑 구축
   */
  private prepareVariantMapping(variants: SceneNode[]): void {
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

    // NodeMatcher 생성
    this.nodeMatcher = new NodeMatcher(
      this.dataManager,
      this.nodeToVariantRoot
    );
  }

  // ===========================================================================
  // Private: 2단계 - 그래프
  // ===========================================================================

  /**
   * Variant 그래프 구축 및 병합 순서 결정
   */
  private buildGraphAndOrder(variants: SceneNode[]): {
    graph: VariantGraph;
    mergeOrder: number[];
  } {
    // 각 variant를 InternalTree로 변환
    const trees = variants.map((variant) =>
      this.convertToInternalTree(variant, variant.name)
    );

    // 그래프 구축
    const graph = this.graphBuilder.buildGraph(variants, trees);

    // 병합 순서 결정
    const mergeOrder = this.graphBuilder.determineMergeOrder(graph);

    return { graph, mergeOrder };
  }

  // ===========================================================================
  // Private: 3단계 - 병합
  // ===========================================================================

  /**
   * 병합 순서에 따라 트리들을 순차적으로 병합
   */
  private mergeTreesInOrder(
    graph: VariantGraph,
    mergeOrder: number[]
  ): InternalTree {
    let merged = graph.nodes[mergeOrder[0]].tree;
    let prevProps = graph.nodes[mergeOrder[0]].props;

    for (let i = 1; i < mergeOrder.length; i++) {
      const currentProps = graph.nodes[mergeOrder[i]].props;
      const nextTree = graph.nodes[mergeOrder[i]].tree;

      const propDiff = this.calculatePropDiff(prevProps, currentProps);
      merged = this.mergeTwoTrees(merged, nextTree, propDiff);

      prevProps = currentProps;
    }

    return merged;
  }

  /**
   * 두 props의 차이 계산
   */
  private calculatePropDiff(
    propsA: Record<string, string>,
    propsB: Record<string, string>
  ): PropDiffInfo {
    const keysA = Object.keys(propsA);
    const keysB = Object.keys(propsB);
    const allKeys = new Set([...keysA, ...keysB]);
    const diffs: string[] = [];

    for (const key of allKeys) {
      if (propsA[key] !== propsB[key]) {
        diffs.push(key);
      }
    }

    return {
      diffCount: diffs.length,
      diffPropName: diffs.length === 1 ? diffs[0] : undefined,
    };
  }

  /**
   * 두 InternalTree 병합
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
   * children 배열 병합 (재귀)
   */
  private mergeChildren(
    childrenA: InternalNode[],
    childrenB: InternalNode[],
    propDiff: PropDiffInfo
  ): InternalNode[] {
    const merged: InternalNode[] = [...childrenA];
    const usedIndices = new Set<number>();

    for (const childB of childrenB) {
      const matchIdx = merged.findIndex(
        (childA, idx) =>
          !usedIndices.has(idx) && this.nodeMatcher!.isSameNode(childA, childB)
      );

      if (matchIdx !== -1) {
        // 매칭 성공 → mergedNodes 병합 + children 재귀 병합
        usedIndices.add(matchIdx);
        merged[matchIdx] = {
          ...merged[matchIdx],
          mergedNodes: [
            ...(merged[matchIdx].mergedNodes || []),
            ...(childB.mergedNodes || []),
          ],
          children: this.mergeChildren(
            merged[matchIdx].children,
            childB.children,
            propDiff
          ),
        };
      } else {
        // 매칭 실패 → 새 노드로 추가
        merged.push(childB);
      }
    }

    return merged;
  }

  // ===========================================================================
  // Private: 4단계 - 정렬
  // ===========================================================================

  /**
   * Children을 정규화된 x 좌표로 정렬 (재귀)
   */
  private sortChildrenByPosition(node: InternalNode): void {
    node.children.sort((a, b) => {
      const aX = this.getAverageNormalizedX(a);
      const bX = this.getAverageNormalizedX(b);
      return aX - bX;
    });

    for (const child of node.children) {
      this.sortChildrenByPosition(child);
    }
  }

  /**
   * 노드의 평균 정규화된 x 좌표 계산
   */
  private getAverageNormalizedX(node: InternalNode): number {
    if (!node.mergedNodes || node.mergedNodes.length === 0) {
      return 0;
    }

    let totalNormalizedX = 0;
    let count = 0;

    for (const merged of node.mergedNodes) {
      const normalizedX = this.getNormalizedX(merged.id);
      if (normalizedX !== null) {
        totalNormalizedX += normalizedX;
        count++;
      }
    }

    return count > 0 ? totalNormalizedX / count : 0;
  }

  /**
   * 노드 ID의 정규화된 x 좌표 계산
   */
  private getNormalizedX(nodeId: string): number | null {
    const { node: originalNode } = this.dataManager.getById(nodeId);
    const nodeBounds = originalNode?.absoluteBoundingBox as
      | { x: number; y: number; width: number; height: number }
      | undefined;

    if (!nodeBounds) return null;

    // 원본 variant 루트 찾기
    const variantRootId = this.nodeToVariantRoot.get(nodeId);
    if (!variantRootId) return null;

    const { node: variantRoot } = this.dataManager.getById(variantRootId);
    const rootBounds = variantRoot?.absoluteBoundingBox as
      | { x: number; y: number; width: number; height: number }
      | undefined;

    if (!rootBounds || rootBounds.width === 0) return null;

    return (nodeBounds.x - rootBounds.x) / rootBounds.width;
  }

  // ===========================================================================
  // Private: SceneNode → InternalTree 변환
  // ===========================================================================

  /**
   * SceneNode → InternalTree 변환
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
            this.convertToInternalNode(child, variantName)
          )
        : [],
      mergedNodes: [
        {
          id: node.id,
          name: node.name,
          variantName: variantName || node.name,
        },
      ],
      bounds,
    };
  }

  /**
   * SceneNode → InternalNode 변환 (재귀)
   */
  private convertToInternalNode(
    node: SceneNode,
    variantName?: string,
    parent?: InternalNode
  ): InternalNode {
    const children = (node as any).children as SceneNode[] | undefined;
    const bounds = (node as any).absoluteBoundingBox as
      | { x: number; y: number; width: number; height: number }
      | undefined;

    const internalNode: InternalNode = {
      id: node.id,
      type: node.type,
      name: node.name,
      parent,
      children: [],
      mergedNodes: [
        {
          id: node.id,
          name: node.name,
          variantName: variantName || node.name,
        },
      ],
      bounds,
    };

    if (children) {
      internalNode.children = children.map((child) =>
        this.convertToInternalNode(child, variantName, internalNode)
      );
    }

    return internalNode;
  }
}
