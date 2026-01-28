/**
 * Variant Processor
 *
 * Variant 병합 및 IoU 기반 노드 스쿼시를 담당하는 통합 Processor
 *
 * 포함된 기능:
 * - VariantMerger: COMPONENT_SET의 여러 variant를 하나의 통합 트리로 병합
 * - SquashByIou: IoU가 높은 같은 타입의 노드들을 하나로 병합
 */

import type { PreparedDesignData } from "@compiler/types/architecture";
import type {
  IVariantMerger,
  ISquashByIou,
  InternalNode,
  BuildContext,
} from "./interfaces";
import { isInstanceChildId } from "./utils/instanceUtils";
import { hasChildren } from "./utils/typeGuards";
import { TreeBuilderConstants } from "./constants";

// Re-export InternalNode for backward compatibility
export type { InternalNode };

// ============================================================================
// Types
// ============================================================================

/**
 * 병합 정보가 포함된 노드
 * @deprecated Use MergedNodeWithVariant from ./interfaces instead
 */
export interface MergedNodeInfo {
  id: string;
  name: string;
  variantName?: string | null;
}

/** 스쿼시 그룹 */
interface SquashGroup {
  nodeA: InternalNode;
  nodeB: InternalNode;
  iou: number;
}

// Constants imported from ./constants

// ============================================================================
// VariantProcessor Class
// ============================================================================

/**
 * VariantProcessor 클래스
 *
 * COMPONENT_SET의 여러 variant를 하나의 통합 트리로 병합하고
 * IoU가 높은 노드들을 스쿼시하는 통합 Processor
 */
export class VariantProcessor implements IVariantMerger, ISquashByIou {
  private getIouFn: ((nodeA: InternalNode, nodeB: InternalNode) => number | null) | null = null;

  // ==========================================================================
  // Static Pipeline Method
  // ==========================================================================

  static merge(ctx: BuildContext): BuildContext {
    const data = ctx.data;
    const doc = data.document as any;
    const isComponentSet = doc.type === "COMPONENT_SET";

    const instance = new VariantProcessor();
    let internalTree;

    if (isComponentSet && hasChildren(doc)) {
      const variants = doc.children as any[];
      internalTree =
        variants.length > 0
          ? instance.mergeVariants(variants, data)
          : instance.convertToInternalNode(doc, null, doc.name, data);
    } else {
      internalTree = instance.convertToInternalNode(doc, null, doc.name, data);
    }

    return { ...ctx, internalTree };
  }

  // ==========================================================================
  // VariantMerger Methods
  // ==========================================================================

  /**
   * 여러 variant를 하나의 트리로 병합
   *
   * @param variants - COMPONENT_SET의 children (각 variant)
   * @param data - PreparedDesignData
   * @returns 병합된 InternalNode 트리
   */
  public mergeVariants(
    variants: SceneNode[],
    data: PreparedDesignData
  ): InternalNode {
    if (variants.length === 0) {
      throw new Error("No variants to merge");
    }

    // 각 variant를 InternalNode로 변환
    const internalTrees = variants.map((variant) =>
      this.convertToInternalNode(variant, null, variant.name, data)
    );

    // 순차적으로 병합
    let mergedTree = internalTrees[0];
    for (let i = 1; i < internalTrees.length; i++) {
      mergedTree = this.mergeTree(mergedTree, internalTrees[i], data);
    }

    // IoU 기반 노드 스쿼시 (중복 노드 정리)
    mergedTree = this.squashWithFunction(mergedTree, (nodeA, nodeB) =>
      this.getIouFromRoot(nodeA, nodeB, data)
    );

    return mergedTree;
  }

  /**
   * 단일 SceneNode를 InternalNode로 변환
   *
   * @param node - SceneNode
   * @param parent - 부모 InternalNode
   * @param variantName - variant 이름
   * @param data - PreparedDesignData
   */
  public convertToInternalNode(
    node: SceneNode,
    parent: InternalNode | null,
    variantName: string,
    _data: PreparedDesignData
  ): InternalNode {
    const bounds = node.absoluteBoundingBox
      ? {
          x: node.absoluteBoundingBox.x,
          y: node.absoluteBoundingBox.y,
          width: node.absoluteBoundingBox.width,
          height: node.absoluteBoundingBox.height,
        }
      : undefined;

    const internalNode: InternalNode = {
      id: node.id,
      type: node.type,
      name: node.name,
      parent,
      children: [],
      mergedNode: [
        {
          id: node.id,
          name: node.name,
          variantName,
        },
      ],
      bounds,
    };

    // 자식 노드 변환
    if ("children" in node && node.children) {
      internalNode.children = node.children.map((child) =>
        this.convertToInternalNode(child, internalNode, variantName, _data)
      );
    }

    return internalNode;
  }

  /**
   * 두 노드의 IoU 계산 (DOMRect 기반 - 인터페이스 구현)
   */
  public calculateIoU(box1: DOMRect, box2: DOMRect): number {
    return calculateIoU(
      { x: box1.x, y: box1.y, width: box1.width, height: box1.height },
      { x: box2.x, y: box2.y, width: box2.width, height: box2.height }
    );
  }

  /**
   * 두 노드가 같은 노드인지 확인 (IoU 기반 - 인터페이스 구현)
   */
  public isSameNode(
    node1: SceneNode,
    node2: SceneNode,
    threshold: number = TreeBuilderConstants.IOU_THRESHOLD
  ): boolean {
    // 타입이 다르면 다른 노드
    if (node1.type !== node2.type) return false;

    // 같은 ID면 같은 노드
    if (node1.id === node2.id) return true;

    // absoluteBoundingBox로 IoU 계산
    if (node1.absoluteBoundingBox && node2.absoluteBoundingBox) {
      const iou = calculateIoU(
        node1.absoluteBoundingBox,
        node2.absoluteBoundingBox
      );
      return iou >= threshold;
    }

    return false;
  }

  // ==========================================================================
  // SquashByIou Methods
  // ==========================================================================

  /**
   * IoU 기반으로 노드 트리 스쿼시 (인터페이스 구현)
   *
   * @param trees - 병합할 트리들
   * @param threshold - IoU 임계값 (기본값 0.5)
   * @returns 스쿼시된 단일 트리
   */
  public squashByIou(trees: InternalNode[], threshold: number = TreeBuilderConstants.SQUASH_IOU_THRESHOLD): InternalNode {
    if (trees.length === 0) {
      throw new Error("No trees to squash");
    }

    if (trees.length === 1) {
      return trees[0];
    }

    // 첫 번째 트리를 기준으로 병합
    let root = trees[0];

    // 간단한 IoU 함수 사용 (bounds 기반)
    const simpleGetIou = (nodeA: InternalNode, nodeB: InternalNode): number | null => {
      if (!nodeA.bounds || !nodeB.bounds) return null;
      return calculateIouFromBounds(nodeA.bounds, nodeB.bounds);
    };

    // 스쿼시 수행
    root = this.squashWithFunction(root, this.getIouFn || simpleGetIou, threshold);

    return root;
  }

  /**
   * getIou 함수 설정 (레거시 호환)
   */
  public setGetIouFunction(
    fn: (nodeA: InternalNode, nodeB: InternalNode) => number | null
  ): void {
    this.getIouFn = fn;
  }

  /**
   * IoU 함수를 사용한 스쿼시 (내부 사용 및 레거시 호환)
   */
  public squashWithFunction(
    root: InternalNode,
    getIou: (nodeA: InternalNode, nodeB: InternalNode) => number | null,
    threshold: number = TreeBuilderConstants.SQUASH_IOU_THRESHOLD
  ): InternalNode {
    // 1. 타입별 노드 그룹핑
    const nodesByType = groupNodesByType(root);

    // 2. 스쿼시 대상 그룹 찾기
    const squashGroups = findSquashGroups(nodesByType, getIou, threshold);

    // 3. 유효한 그룹만 필터링
    const validGroups = squashGroups.filter((group) =>
      isValidSquashGroup(group.nodeA, group.nodeB)
    );

    // 4. 스쿼시 수행
    for (const group of validGroups) {
      performSquash(group.nodeA, group.nodeB);
    }

    return root;
  }

  // ==========================================================================
  // Private Helpers (VariantMerger)
  // ==========================================================================

  /**
   * 두 트리를 병합 (내부 사용)
   * BFS로 탐색하여 같은 노드는 mergedNode에 추가, 다른 노드는 트리에 추가
   */
  private mergeTree(
    pivot: InternalNode,
    target: InternalNode,
    data: PreparedDesignData
  ): InternalNode {
    const nodesToAdd: Array<{ parent: InternalNode; node: InternalNode }> = [];

    // BFS로 target 트리 순회
    const queue: Array<{ node: InternalNode; depth: number }> = [
      { node: target, depth: 0 },
    ];

    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) continue;
      const { node: targetNode, depth } = item;

      // 1. 같은 depth에서 동일 노드 찾기
      const sameDepthNodes = this.getNodesAtDepth(pivot, depth);
      const matchedNode = sameDepthNodes.find((pivotNode) =>
        this.isSameInternalNode(targetNode, pivotNode, data)
      );

      if (matchedNode) {
        // 같은 노드 발견 → mergedNode에 추가
        matchedNode.mergedNode.push(...targetNode.mergedNode);
      } else if (targetNode.parent) {
        // 부모와 매칭되는 pivot 노드 찾기
        const parentDepthNodes = this.getNodesAtDepth(pivot, depth - 1);
        const matchedParent = parentDepthNodes.find((pivotNode) =>
          this.isSameInternalNode(targetNode.parent!, pivotNode, data)
        );

        if (matchedParent) {
          nodesToAdd.push({ parent: matchedParent, node: targetNode });
        }
      }

      // 자식 노드들을 큐에 추가
      for (const child of targetNode.children) {
        queue.push({ node: child, depth: depth + 1 });
      }
    }

    // 수집된 노드들을 트리에 추가
    for (const { parent, node } of nodesToAdd) {
      node.parent = parent;
      parent.children.push(node);
    }

    return pivot;
  }

  /**
   * 특정 depth의 모든 노드 반환 (내부 사용)
   */
  private getNodesAtDepth(root: InternalNode, targetDepth: number): InternalNode[] {
    const result: InternalNode[] = [];
    const queue: Array<{ node: InternalNode; depth: number }> = [
      { node: root, depth: 0 },
    ];

    while (queue.length > 0) {
      const { node, depth } = queue.shift()!;

      if (depth === targetDepth) {
        result.push(node);
      } else if (depth < targetDepth) {
        for (const child of node.children) {
          queue.push({ node: child, depth: depth + 1 });
        }
      }
    }

    return result;
  }

  /**
   * 두 InternalNode가 같은 노드인지 확인 (내부 사용)
   */
  private isSameInternalNode(
    node1: InternalNode,
    node2: InternalNode,
    data: PreparedDesignData
  ): boolean {
    // 타입이 다르면 다른 노드
    if (node1.type !== node2.type) return false;

    // 같은 ID면 같은 노드 (경고 상황)
    if (node1.id === node2.id) return true;

    // 부모가 없으면 (루트) → 루트끼리는 같음
    if (!node1.parent && !node2.parent) return true;

    // IoU 계산
    if (node1.bounds && node2.bounds && node1.parent && node2.parent) {
      const parent1Spec = data.getNodeById(node1.parent.id);
      const parent2Spec = data.getNodeById(node2.parent.id);

      if (
        parent1Spec?.absoluteBoundingBox &&
        parent2Spec?.absoluteBoundingBox &&
        parent1Spec.absoluteBoundingBox.width === parent2Spec.absoluteBoundingBox.width &&
        parent1Spec.absoluteBoundingBox.height === parent2Spec.absoluteBoundingBox.height
      ) {
        const relBox1 = getRelativeBounds(node1.bounds, parent1Spec.absoluteBoundingBox);
        const relBox2 = getRelativeBounds(node2.bounds, parent2Spec.absoluteBoundingBox);

        const iou = calculateIoU(relBox1, relBox2);

        // TEXT는 낮은 임계값 (10%), 그 외는 80%
        const threshold = node1.type === "TEXT"
          ? TreeBuilderConstants.TEXT_IOU_THRESHOLD
          : TreeBuilderConstants.IOU_THRESHOLD;
        if (iou < threshold) return false;
      }
    }

    return true;
  }

  /**
   * Root Component 기준으로 IoU 계산 (내부 사용)
   */
  private getIouFromRoot(
    node1: InternalNode,
    node2: InternalNode,
    data: PreparedDesignData
  ): number | null {
    if (!node1.parent || !node2.parent) return null;

    // 루트 노드 찾기
    const getRoot = (node: InternalNode): InternalNode => {
      let current = node;
      while (current.parent) {
        current = current.parent;
      }
      return current;
    };

    const root1 = getRoot(node1);
    const root2 = getRoot(node2);

    const root1Spec = data.getNodeById(root1.id);
    const root2Spec = data.getNodeById(root2.id);

    if (!root1Spec?.absoluteBoundingBox || !root2Spec?.absoluteBoundingBox) {
      return null;
    }

    // 부모 타입/구조가 다르면 비교 불가
    if (root1Spec.type !== root2Spec.type) return null;

    const node1Spec = data.getNodeById(node1.id);
    const node2Spec = data.getNodeById(node2.id);

    if (!node1Spec?.absoluteBoundingBox || !node2Spec?.absoluteBoundingBox) {
      return null;
    }

    // 정규화된 좌표 계산 (0~1 범위)
    const normalize = (
      nodeBounds: { x: number; y: number; width: number; height: number },
      rootBounds: { x: number; y: number; width: number; height: number }
    ) => ({
      x1: (nodeBounds.x - rootBounds.x) / rootBounds.width,
      y1: (nodeBounds.y - rootBounds.y) / rootBounds.height,
      x2: (nodeBounds.x + nodeBounds.width - rootBounds.x) / rootBounds.width,
      y2: (nodeBounds.y + nodeBounds.height - rootBounds.y) / rootBounds.height,
    });

    const rect1 = normalize(node1Spec.absoluteBoundingBox, root1Spec.absoluteBoundingBox);
    const rect2 = normalize(node2Spec.absoluteBoundingBox, root2Spec.absoluteBoundingBox);

    // IoU 계산
    const ix1 = Math.max(rect1.x1, rect2.x1);
    const iy1 = Math.max(rect1.y1, rect2.y1);
    const ix2 = Math.min(rect1.x2, rect2.x2);
    const iy2 = Math.min(rect1.y2, rect2.y2);
    const iw = Math.max(0, ix2 - ix1);
    const ih = Math.max(0, iy2 - iy1);
    const inter = iw * ih;

    const areaA = Math.max(0, rect1.x2 - rect1.x1) * Math.max(0, rect1.y2 - rect1.y1);
    const areaB = Math.max(0, rect2.x2 - rect2.x1) * Math.max(0, rect2.y2 - rect2.y1);
    const uni = areaA + areaB - inter;

    return uni <= 0 ? 0 : inter / uni;
  }
}

// ============================================================================
// Standalone Utility Functions
// ============================================================================

/**
 * 부모 기준 상대 좌표 계산
 */
export function getRelativeBounds(
  nodeBounds: { x: number; y: number; width: number; height: number },
  parentBounds: { x: number; y: number; width: number; height: number }
) {
  return {
    x: nodeBounds.x - parentBounds.x,
    y: nodeBounds.y - parentBounds.y,
    width: nodeBounds.width,
    height: nodeBounds.height,
  };
}

/**
 * IoU (Intersection over Union) 계산
 */
export function calculateIoU(
  box1: { x: number; y: number; width: number; height: number },
  box2: { x: number; y: number; width: number; height: number }
): number {
  const xOverlap = Math.max(
    0,
    Math.min(box1.x + box1.width, box2.x + box2.width) - Math.max(box1.x, box2.x)
  );
  const yOverlap = Math.max(
    0,
    Math.min(box1.y + box1.height, box2.y + box2.height) - Math.max(box1.y, box2.y)
  );

  const intersectionArea = xOverlap * yOverlap;
  const area1 = box1.width * box1.height;
  const area2 = box2.width * box2.height;

  if (area1 === 0 || area2 === 0) {
    return box1.x === box2.x && box1.y === box2.y &&
      box1.width === box2.width && box1.height === box2.height
      ? 1
      : 0;
  }

  const unionArea = area1 + area2 - intersectionArea;
  return unionArea === 0 ? 0 : intersectionArea / unionArea;
}

/**
 * bounds에서 IoU 계산
 */
function calculateIouFromBounds(
  bounds1: { x: number; y: number; width: number; height: number },
  bounds2: { x: number; y: number; width: number; height: number }
): number {
  const ix1 = Math.max(bounds1.x, bounds2.x);
  const iy1 = Math.max(bounds1.y, bounds2.y);
  const ix2 = Math.min(bounds1.x + bounds1.width, bounds2.x + bounds2.width);
  const iy2 = Math.min(bounds1.y + bounds1.height, bounds2.y + bounds2.height);

  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;

  const area1 = bounds1.width * bounds1.height;
  const area2 = bounds2.width * bounds2.height;
  const union = area1 + area2 - inter;

  return union <= 0 ? 0 : inter / union;
}

/**
 * 타입별로 노드 그룹핑
 */
function groupNodesByType(root: InternalNode): Map<string, InternalNode[]> {
  const nodesByType = new Map<string, InternalNode[]>();

  const traverse = (node: InternalNode) => {
    if (!nodesByType.has(node.type)) {
      nodesByType.set(node.type, []);
    }
    nodesByType.get(node.type)!.push(node);

    for (const child of node.children) {
      traverse(child);
    }
  };

  traverse(root);
  return nodesByType;
}

/**
 * IoU 기반 스쿼시 대상 그룹 찾기
 */
function findSquashGroups(
  nodesByType: Map<string, InternalNode[]>,
  getIou: (nodeA: InternalNode, nodeB: InternalNode) => number | null,
  threshold: number = TreeBuilderConstants.SQUASH_IOU_THRESHOLD
): SquashGroup[] {
  const groups: SquashGroup[] = [];

  for (const [_type, nodes] of nodesByType) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const iou = getIou(nodes[i], nodes[j]);
        if (iou !== null && iou >= threshold) {
          groups.push({
            nodeA: nodes[i],
            nodeB: nodes[j],
            iou,
          });
        }
      }
    }
  }

  return groups;
}

/**
 * 스쿼시 그룹이 유효한지 검증
 */
function isValidSquashGroup(nodeA: InternalNode, nodeB: InternalNode): boolean {
  // INSTANCE 자식 여부 확인 - 둘 다 INSTANCE 자식이거나 둘 다 아니어야 함
  const isInstanceA = isInstanceChildId(nodeA.id);
  const isInstanceB = isInstanceChildId(nodeB.id);
  if (isInstanceA !== isInstanceB) return false;

  // 조상-자손 관계면 스쿼시 불가
  if (isAncestorDescendant(nodeA, nodeB)) return false;

  return true;
}

/**
 * 조상-자손 관계인지 확인
 */
function isAncestorDescendant(nodeA: InternalNode, nodeB: InternalNode): boolean {
  // nodeA가 nodeB의 조상인지 확인
  let current: InternalNode | null = nodeB.parent;
  while (current) {
    if (current.id === nodeA.id) return true;
    current = current.parent;
  }

  // nodeB가 nodeA의 조상인지 확인
  current = nodeA.parent;
  while (current) {
    if (current.id === nodeB.id) return true;
    current = current.parent;
  }

  return false;
}

/**
 * 스쿼시 수행: nodeB를 nodeA로 병합
 */
function performSquash(nodeA: InternalNode, nodeB: InternalNode): void {
  // mergedNode 병합
  nodeA.mergedNode = [...nodeA.mergedNode, ...nodeB.mergedNode];

  // nodeB를 부모의 children에서 제거
  if (nodeB.parent) {
    nodeB.parent.children = nodeB.parent.children.filter(
      (child) => child.id !== nodeB.id
    );
  }
}

/**
 * 두 노드의 IoU 계산 (Root Component 기준)
 *
 * @param nodeA - 첫 번째 노드
 * @param nodeB - 두 번째 노드
 * @param getRootBounds - 노드의 루트 기준 정규화된 bounds 반환 함수
 * @returns IoU 값 (0~1) 또는 null
 */
export function calculateIouFromRoot(
  nodeA: InternalNode,
  nodeB: InternalNode,
  getRootBounds: (node: InternalNode) => { x1: number; y1: number; x2: number; y2: number } | null
): number | null {
  const boundsA = getRootBounds(nodeA);
  const boundsB = getRootBounds(nodeB);

  if (!boundsA || !boundsB) return null;

  // 교집합 영역
  const ix1 = Math.max(boundsA.x1, boundsB.x1);
  const iy1 = Math.max(boundsA.y1, boundsB.y1);
  const ix2 = Math.min(boundsA.x2, boundsB.x2);
  const iy2 = Math.min(boundsA.y2, boundsB.y2);
  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;

  // 합집합 영역
  const areaA = Math.max(0, boundsA.x2 - boundsA.x1) * Math.max(0, boundsA.y2 - boundsA.y1);
  const areaB = Math.max(0, boundsB.x2 - boundsB.x1) * Math.max(0, boundsB.y2 - boundsB.y1);
  const uni = areaA + areaB - inter;

  return uni <= 0 ? 0 : inter / uni;
}

export default VariantProcessor;
