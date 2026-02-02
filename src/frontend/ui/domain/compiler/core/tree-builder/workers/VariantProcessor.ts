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
import { hasChildren, isComponentSetNode } from "./utils/typeGuards";
import { TreeBuilderConstants } from "./constants";

// Re-export InternalNode for backward compatibility
export type { InternalNode };

// ============================================================================
// Types
// ============================================================================

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
  /** 노드 ID → 원본 variant 루트 ID 매핑 */
  private nodeToVariantRoot: Map<string, string> = new Map();

  // ==========================================================================
  // Static Pipeline Method
  // ==========================================================================

  static merge(ctx: BuildContext): BuildContext {
    const data = ctx.data;
    const doc = data.document;

    const instance = new VariantProcessor();
    let internalTree: InternalNode;

    if (isComponentSetNode(doc) && hasChildren(doc)) {
      const variants = doc.children;
      internalTree =
        variants.length > 0
          ? instance.mergeVariants(variants as SceneNode[], data)
          : instance.convertToInternalNode(doc, null, doc.name, data);

      // 병합된 트리의 루트 이름을 컴포넌트 세트 이름으로 설정
      // (mergeVariants는 첫 번째 variant의 이름을 사용하므로, 여기서 교정)
      if (variants.length > 0) {
        internalTree.name = doc.name;
      }
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

    // 노드 ID → 원본 variant 루트 ID 매핑 구축
    this.buildNodeToVariantRootMap(variants);

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

    // Wrapper FRAME flatten (일부 variant에만 존재하는 FRAME 제거)
    mergedTree = this.flattenWrapperFrames(mergedTree, variants.length, data);

    return mergedTree;
  }

  /**
   * Wrapper FRAME flatten
   *
   * 일부 variant에만 존재하는 FRAME을 찾아서,
   * 그 children이 다른 variant에서 상위 레벨에 존재하면 FRAME을 제거하고 children을 상위로 올림
   */
  private flattenWrapperFrames(
    root: InternalNode,
    totalVariantCount: number,
    data: PreparedDesignData
  ): InternalNode {
    // BFS로 순회하면서 flatten 대상 찾기
    const toFlatten: InternalNode[] = [];

    const findFlattenTargets = (node: InternalNode) => {
      for (const child of node.children) {
        findFlattenTargets(child);
      }

      // FRAME이 일부 variant에만 존재하는지 확인
      if (node.type === "FRAME" && node.parent) {
        const existsInAllVariants = node.mergedNode.length >= totalVariantCount;

        if (!existsInAllVariants) {
          // FRAME의 children 중 하나라도 형제 노드와 같은 타입/위치면 flatten 대상
          const siblings = node.parent.children.filter((s) => s.id !== node.id);

          for (const child of node.children) {
            const matchingSibling = siblings.find(
              (sibling) =>
                sibling.type === child.type &&
                this.isSamePositionY(child, sibling, data)
            );

            if (matchingSibling) {
              toFlatten.push(node);
              break;
            }
          }
        }
      }
    };

    findFlattenTargets(root);

    // 같은 y 좌표의 FRAME들을 그룹핑하여 하나만 남기고 나머지는 flatten
    const frameGroups = new Map<string, InternalNode[]>();
    for (const frame of toFlatten) {
      const y = this.getNormalizedY(frame, data);
      const key = y !== null ? y.toFixed(2) : frame.id;
      if (!frameGroups.has(key)) {
        frameGroups.set(key, []);
      }
      frameGroups.get(key)!.push(frame);
    }

    // 각 그룹에서 첫 번째 FRAME만 유지하고 나머지는 제거 (children을 첫 번째로 병합)
    for (const [_key, frames] of frameGroups) {
      if (frames.length > 1) {
        const primary = frames[0];
        for (let i = 1; i < frames.length; i++) {
          this.mergeFrameInto(frames[i], primary, data);
        }
      }
    }

    // 남은 FRAME 중 flatten 대상 처리
    for (const frame of toFlatten) {
      if (frame.parent) {
        this.flattenFrame(frame, data);
      }
    }

    return root;
  }

  /**
   * 한 FRAME의 내용을 다른 FRAME으로 병합
   */
  private mergeFrameInto(
    source: InternalNode,
    target: InternalNode,
    data: PreparedDesignData
  ): void {
    // mergedNode 병합
    target.mergedNode.push(...source.mergedNode);

    // children 병합
    for (const sourceChild of source.children) {
      const matchingChild = target.children.find(
        (c) => c.type === sourceChild.type && this.isSamePositionY(c, sourceChild, data)
      );

      if (matchingChild) {
        matchingChild.mergedNode.push(...sourceChild.mergedNode);
      } else {
        sourceChild.parent = target;
        target.children.push(sourceChild);
      }
    }

    // source FRAME 제거
    if (source.parent) {
      source.parent.children = source.parent.children.filter((c) => c.id !== source.id);
    }
  }

  /**
   * 두 노드의 정규화된 y 좌표가 같은지 확인
   */
  private isSamePositionY(
    node1: InternalNode,
    node2: InternalNode,
    data: PreparedDesignData
  ): boolean {
    const y1 = this.getNormalizedY(node1, data);
    const y2 = this.getNormalizedY(node2, data);
    if (y1 === null || y2 === null) return false;
    return Math.abs(y1 - y2) <= 0.1;
  }

  /**
   * FRAME을 flatten하여 children을 상위로 올림
   *
   * FRAME 안의 children 중:
   * - 형제와 매칭되는 노드 → 형제에 병합 (FRAME에서 제거)
   * - 매칭 안 되는 노드 → 상위로 이동
   *
   * 모든 children 처리 후 FRAME 제거
   */
  private flattenFrame(frame: InternalNode, data: PreparedDesignData): void {
    if (!frame.parent) return;

    const parent = frame.parent;
    const frameIndex = parent.children.indexOf(frame);

    // FRAME의 children 처리
    const childrenToMove: InternalNode[] = [];

    for (const child of frame.children) {
      // 같은 타입/위치의 형제가 있으면 병합
      const existingSibling = parent.children.find(
        (sibling) =>
          sibling.id !== frame.id &&
          sibling.type === child.type &&
          this.isSamePositionY(child, sibling, data)
      );

      if (existingSibling) {
        // 기존 형제에 mergedNode 병합
        existingSibling.mergedNode.push(...child.mergedNode);
        // children도 병합
        for (const grandChild of child.children) {
          grandChild.parent = existingSibling;
          existingSibling.children.push(grandChild);
        }
        // child는 FRAME에서 제거됨 (상위로 이동 안 함)
      } else {
        // 상위로 이동할 노드
        childrenToMove.push(child);
      }
    }

    // 상위로 이동할 children 추가
    for (const child of childrenToMove) {
      child.parent = parent;
      parent.children.splice(frameIndex, 0, child);
    }

    // FRAME 제거
    parent.children = parent.children.filter((c) => c.id !== frame.id);
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
   *
   * depth 제한 없이 전체 트리에서 타입이 같고 위치가 비슷한 노드를 매칭
   */
  private mergeTree(
    pivot: InternalNode,
    target: InternalNode,
    data: PreparedDesignData
  ): InternalNode {
    const nodesToAdd: Array<{ parent: InternalNode; node: InternalNode }> = [];
    // 이미 매칭된 pivot 노드 추적 (중복 매칭 방지)
    const matchedPivotIds = new Set<string>();

    // BFS로 target 트리 순회
    const queue: Array<{ node: InternalNode }> = [{ node: target }];

    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) continue;
      const { node: targetNode } = item;

      // 1. 전체 트리에서 타입이 같은 노드 중 매칭되는 노드 찾기
      const allNodesOfSameType = this.getAllNodesOfType(pivot, targetNode.type);
      const matchedNode = allNodesOfSameType.find(
        (pivotNode) =>
          !matchedPivotIds.has(pivotNode.id) &&
          this.isSameInternalNode(targetNode, pivotNode, data)
      );

      if (matchedNode) {
        // 같은 노드 발견 → mergedNode에 추가
        matchedNode.mergedNode.push(...targetNode.mergedNode);
        matchedPivotIds.add(matchedNode.id);
      } else if (targetNode.parent) {
        // 부모와 매칭되는 pivot 노드 찾기
        const allParentTypeNodes = this.getAllNodesOfType(pivot, targetNode.parent.type);
        const matchedParent = allParentTypeNodes.find((pivotNode) =>
          this.isSameInternalNode(targetNode.parent!, pivotNode, data)
        );

        if (matchedParent) {
          nodesToAdd.push({ parent: matchedParent, node: targetNode });
        }
      }

      // 자식 노드들을 큐에 추가
      for (const child of targetNode.children) {
        queue.push({ node: child });
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
   * 트리에서 특정 타입의 모든 노드 반환
   */
  private getAllNodesOfType(root: InternalNode, type: string): InternalNode[] {
    const result: InternalNode[] = [];
    const queue: InternalNode[] = [root];

    while (queue.length > 0) {
      const node = queue.shift()!;
      if (node.type === type) {
        result.push(node);
      }
      for (const child of node.children) {
        queue.push(child);
      }
    }

    return result;
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
   *
   * 루트 기준 정규화된 좌표로 비교하여 depth가 달라도 매칭 가능
   * 정규화된 x, y 좌표(시작점) 차이가 0.1 이내면 같은 노드로 인식
   */
  private isSameInternalNode(
    node1: InternalNode,
    node2: InternalNode,
    data: PreparedDesignData
  ): boolean {
    // 타입이 다르면 다른 노드
    if (node1.type !== node2.type) return false;

    // 같은 ID면 같은 노드
    if (node1.id === node2.id) return true;

    // 부모가 없으면 (루트) → 루트끼리는 같음
    if (!node1.parent && !node2.parent) return true;

    // 정규화된 좌표(시작점) 비교
    const pos1 = this.getNormalizedPosition(node1, data);
    const pos2 = this.getNormalizedPosition(node2, data);
    if (!pos1 || !pos2) return false;

    // x, y 좌표 차이가 0.1 이내면 같은 노드
    return Math.abs(pos1.x - pos2.x) <= 0.1 && Math.abs(pos1.y - pos2.y) <= 0.1;
  }

  /**
   * 노드의 정규화된 좌표 (원본 variant 루트 기준) 반환
   *
   * InternalNode 트리가 아닌 SceneNode 트리를 순회하여 원본 variant 루트를 찾음.
   * 이렇게 해야 병합된 트리에서도 각 노드의 원래 variant 기준으로 정규화됨.
   */
  private getNormalizedPosition(node: InternalNode, data: PreparedDesignData): { x: number; y: number } | null {
    const nodeSpec = data.getNodeById(node.id);
    if (!nodeSpec?.absoluteBoundingBox) {
      return null;
    }

    // SceneNode 트리를 순회하여 원본 variant 루트 찾기
    const rootSpec = this.findOriginalRoot(node.id, data);
    if (!rootSpec?.absoluteBoundingBox) {
      return null;
    }

    const rootBox = rootSpec.absoluteBoundingBox;
    const nodeBox = nodeSpec.absoluteBoundingBox;

    if (rootBox.width === 0 || rootBox.height === 0) return null;

    return {
      x: (nodeBox.x - rootBox.x) / rootBox.width,
      y: (nodeBox.y - rootBox.y) / rootBox.height,
    };
  }

  /**
   * 노드의 정규화된 y 좌표 (원본 variant 루트 기준) 반환
   *
   * getNormalizedPosition의 y 좌표만 반환하는 헬퍼
   */
  private getNormalizedY(node: InternalNode, data: PreparedDesignData): number | null {
    const pos = this.getNormalizedPosition(node, data);
    return pos ? pos.y : null;
  }

  /**
   * 노드 ID → 원본 variant 루트 ID 매핑 구축
   *
   * 각 variant의 모든 노드를 순회하여 원본 variant 루트 ID를 기록
   */
  private buildNodeToVariantRootMap(variants: SceneNode[]): void {
    this.nodeToVariantRoot.clear();

    const traverse = (node: SceneNode, variantRootId: string) => {
      this.nodeToVariantRoot.set(node.id, variantRootId);
      if ("children" in node && node.children) {
        for (const child of node.children) {
          traverse(child, variantRootId);
        }
      }
    };

    for (const variant of variants) {
      traverse(variant, variant.id);
    }
  }

  /**
   * 노드 ID로 원본 variant 루트 SceneNode 찾기
   */
  private findOriginalRoot(nodeId: string, data: PreparedDesignData): SceneNode | null {
    const variantRootId = this.nodeToVariantRoot.get(nodeId);
    if (!variantRootId) return null;
    return data.getNodeById(variantRootId) || null;
  }

  /**
   * 노드의 루트 찾기 (InternalNode 트리 기준 - deprecated, 참조용으로 유지)
   */
  private getRoot(node: InternalNode): InternalNode {
    let current = node;
    while (current.parent) {
      current = current.parent;
    }
    return current;
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
