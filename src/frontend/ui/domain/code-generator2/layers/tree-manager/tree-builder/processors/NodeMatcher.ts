import { InternalNode } from "../../../../types/types";
import DataManager from "../../../data-manager/DataManager";
import { LayoutNormalizer } from "./LayoutNormalizer";
import {
  createDefaultEngine,
  defaultMatchingPolicy,
  type MatchContext,
  type MatchDecisionEngine,
} from "./match-engine";

/**
 * NodeMatcher
 *
 * 두 InternalNode가 같은 역할을 하는지 판단하는 매칭 로직
 *
 * 매칭 기준:
 * 1. 타입 체크
 * 2. ID 체크
 * 3. 정규화된 위치 비교 (±0.1)
 * 4. TEXT 노드: 부모 타입 + TEXT 수
 * 5. INSTANCE 노드: componentPropertyReferences.visible
 */
export class NodeMatcher {
  private readonly dataManager: DataManager;

  /** 노드 ID → 원본 variant 루트 ID 매핑 */
  private nodeToVariantRoot: Map<string, string>;

  /** Shape 계열 타입 — Figma가 같은 도형을 다른 타입으로 표현할 수 있으므로 상호 호환 */
  private static readonly SHAPE_TYPES = new Set([
    "RECTANGLE", "VECTOR", "ELLIPSE", "LINE", "STAR", "POLYGON", "BOOLEAN_OPERATION",
  ]);

  /** 컨테이너 계열 타입 — Figma가 variant에 따라 GROUP↔FRAME을 바꿀 수 있으므로 상호 호환 */
  private static readonly CONTAINER_TYPES = new Set([
    "GROUP", "FRAME",
  ]);

  /** 매칭 결정 엔진 (Phase 1a 섀도 모드: legacy와 비교만, 반환값은 legacy 사용) */
  private readonly engine: MatchDecisionEngine = createDefaultEngine();

  constructor(
    dataManager: DataManager,
    nodeToVariantRoot: Map<string, string>,
    private readonly layoutNormalizer: LayoutNormalizer
  ) {
    this.dataManager = dataManager;
    this.nodeToVariantRoot = nodeToVariantRoot;
  }

  /**
   * 두 노드가 같은 역할을 하는지 판단.
   *
   * Phase 1a 섀도 모드: legacy 로직을 실행해 반환값으로 쓰되,
   * globalThis.__SHADOW_MODE_COLLECTOR__가 설정돼 있으면 엔진도 돌려 비교.
   * 불일치는 collector에 push되어 테스트가 검증한다.
   */
  public isSameNode(nodeA: InternalNode, nodeB: InternalNode): boolean {
    const legacyResult = this.isSameNodeLegacy(nodeA, nodeB);

    const collector = (globalThis as any).__SHADOW_MODE_COLLECTOR__ as
      | Array<{ pair: [string, string]; old: boolean; engine: boolean }>
      | undefined;
    if (collector) {
      const ctx: MatchContext = {
        dataManager: this.dataManager,
        layoutNormalizer: this.layoutNormalizer,
        nodeToVariantRoot: this.nodeToVariantRoot,
        policy: defaultMatchingPolicy,
      };
      const decision = this.engine.decide(nodeA, nodeB, ctx);
      const engineResult = decision.decision === "match";
      if (engineResult !== legacyResult) {
        collector.push({ pair: [nodeA.id, nodeB.id], old: legacyResult, engine: engineResult });
      }
    }

    return legacyResult;
  }

  /** 기존 isSameNode 로직 — 내부 전용, Phase 1c에서 제거 예정 */
  private isSameNodeLegacy(nodeA: InternalNode, nodeB: InternalNode): boolean {
    // 1. 타입 호환성 체크 (shape 계열, 컨테이너 계열은 상호 호환)
    if (nodeA.type !== nodeB.type) {
      const bothShapes =
        NodeMatcher.SHAPE_TYPES.has(nodeA.type) &&
        NodeMatcher.SHAPE_TYPES.has(nodeB.type);
      const bothContainers =
        NodeMatcher.CONTAINER_TYPES.has(nodeA.type) &&
        NodeMatcher.CONTAINER_TYPES.has(nodeB.type);
      if (!bothShapes && !bothContainers) return false;
    }

    // 2. 같은 ID면 같은 노드
    if (nodeA.id === nodeB.id) {
      return true;
    }

    // INSTANCE는 componentId와 무관하게 위치 기반 매칭

    // 3. 부모가 없으면 (루트) → 루트끼리는 같음
    if (!nodeA.parent && !nodeB.parent) {
      return true;
    }

    // 4. 정규화된 위치 비교 (직접 부모 기준 독립 정규화)
    const posCost = this.calcPositionCostByNormalizer(nodeA, nodeB);
    if (posCost <= 0.1) {
      // Shape 타입은 크기 유사도도 검증 (중심점이 같은 동심원 오매칭 방지)
      if (NodeMatcher.SHAPE_TYPES.has(nodeA.type) && NodeMatcher.SHAPE_TYPES.has(nodeB.type)) {
        if (!this.isSimilarSize(nodeA, nodeB)) return false;
      }
      // GROUP↔FRAME 교차 매칭 시 크기 검증 (구조적으로 다른 노드 오매칭 방지)
      if (nodeA.type !== nodeB.type &&
          NodeMatcher.CONTAINER_TYPES.has(nodeA.type) &&
          NodeMatcher.CONTAINER_TYPES.has(nodeB.type)) {
        if (!this.isSimilarSize(nodeA, nodeB)) return false;
      }
      return true;
    }

    // 5. TEXT 노드 특별 매칭
    if (this.isSameTextNode(nodeA, nodeB)) {
      return true;
    }

    // 6. INSTANCE 노드 특별 매칭
    if (this.isSameInstanceNode(nodeA, nodeB)) {
      return true;
    }

    return false;
  }

  /**
   * Pass 1용: 확정 매칭 (ID 일치 또는 같은 이름+타입 유일 쌍)
   * 위치 비교 없이 결정적으로 매칭 가능한 쌍을 판별
   */
  public isDefiniteMatch(nodeA: InternalNode, nodeB: InternalNode): boolean {
    // 타입 호환성 체크
    if (nodeA.type !== nodeB.type) {
      const bothShapes =
        NodeMatcher.SHAPE_TYPES.has(nodeA.type) &&
        NodeMatcher.SHAPE_TYPES.has(nodeB.type);
      const bothContainers =
        NodeMatcher.CONTAINER_TYPES.has(nodeA.type) &&
        NodeMatcher.CONTAINER_TYPES.has(nodeB.type);
      if (!bothShapes && !bothContainers) return false;
    }

    // 같은 ID면 확정 매칭
    if (nodeA.id === nodeB.id) return true;

    return false;
  }

  /**
   * Pass 2용: 위치 기반 매칭 비용 반환 (0~1 범위, 낮을수록 유사)
   * 매칭 불가하면 Infinity 반환
   */
  public getPositionCost(nodeA: InternalNode, nodeB: InternalNode): number {
    // 타입 호환성 체크
    if (nodeA.type !== nodeB.type) {
      const bothShapes =
        NodeMatcher.SHAPE_TYPES.has(nodeA.type) &&
        NodeMatcher.SHAPE_TYPES.has(nodeB.type);
      const bothContainers =
        NodeMatcher.CONTAINER_TYPES.has(nodeA.type) &&
        NodeMatcher.CONTAINER_TYPES.has(nodeB.type);
      if (!bothShapes && !bothContainers) return Infinity;
    }

    // INSTANCE: 둘 다 componentSetId가 있는데 다르면 Infinity
    // INSTANCE는 componentId와 무관하게 위치 기반 매칭

    // 루트끼리
    if (!nodeA.parent && !nodeB.parent) return 0;

    // 위치 비용 계산
    const posCost = this.calcPositionCostByNormalizer(nodeA, nodeB);
    if (posCost <= 0.1) {
      // Shape/Container 크기 검증
      if (NodeMatcher.SHAPE_TYPES.has(nodeA.type) && NodeMatcher.SHAPE_TYPES.has(nodeB.type)) {
        if (!this.isSimilarSize(nodeA, nodeB)) return Infinity;
      }
      if (nodeA.type !== nodeB.type &&
          NodeMatcher.CONTAINER_TYPES.has(nodeA.type) &&
          NodeMatcher.CONTAINER_TYPES.has(nodeB.type)) {
        if (!this.isSimilarSize(nodeA, nodeB)) return Infinity;
      }
      // (shift 보정 제거됨: LayoutNormalizer는 직접 부모 기준으로 이미 보정됨)
      // overflow 노드(부모보다 큰 터치 영역)와 normal 노드의 오매칭 방지
      // variant root 크기가 비슷할 때만 적용 (크기가 많이 다르면 overflow 상태가 자연스럽게 달라짐)
      if (NodeMatcher.CONTAINER_TYPES.has(nodeA.type) &&
          NodeMatcher.CONTAINER_TYPES.has(nodeB.type)) {
        const rootA = this.getVariantRootBounds(nodeA);
        const rootB = this.getVariantRootBounds(nodeB);
        const rootSimilar = rootA && rootB &&
          Math.max(rootA.width, rootB.width) / Math.min(rootA.width, rootB.width) <= 1.5 &&
          Math.max(rootA.height, rootB.height) / Math.min(rootA.height, rootB.height) <= 1.5;
        if (rootSimilar) {
          const overA = this.isOverflowNode(nodeA);
          const overB = this.isOverflowNode(nodeB);
          if (overA !== overB) return posCost + 0.5;
        }
      }
      return posCost;
    }

    // TEXT 특별 매칭
    if (this.isSameTextNode(nodeA, nodeB)) return 0.05;

    // INSTANCE 특별 매칭
    if (this.isSameInstanceNode(nodeA, nodeB)) return 0.05;

    return Infinity;
  }

  /**
   * LayoutNormalizer 기반 위치 비용 계산.
   * 각 노드의 직접 부모를 reference로 사용하여 독립 정규화 후 compare.
   * 독립 정규화 cost가 높으면 avgSize 기반 fallback (variant root 크기가 크게 다를 때).
   */
  private calcPositionCostByNormalizer(nodeA: InternalNode, nodeB: InternalNode): number {
    if (!nodeA.mergedNodes?.[0] || !nodeB.mergedNodes?.[0]) return Infinity;

    const parentA = this.findDirectParent(nodeA.mergedNodes[0].id);
    const parentB = this.findDirectParent(nodeB.mergedNodes[0].id);

    const origA = this.dataManager.getById(nodeA.mergedNodes[0].id)?.node;
    const origB = this.dataManager.getById(nodeB.mergedNodes[0].id)?.node;

    if (!parentA || !parentB || !origA || !origB) return Infinity;

    const posA = this.layoutNormalizer.normalize(parentA, origA);
    const posB = this.layoutNormalizer.normalize(parentB, origB);

    if (!posA || !posB) return Infinity;

    const cost = this.layoutNormalizer.compare(posA, posB);
    if (cost <= 0.1) return cost;

    // Fallback: avgSize 기반 비교.
    // reference 크기가 크게 다르면 독립 정규화가 발산하므로 (예: Dropdown의
    // variant root 80px vs 460px), 절대 offset 차이를 평균 크기로 나눈다.
    const avgCost = this.layoutNormalizer.compareAvgSize(parentA, origA, parentB, origB);
    return Math.min(cost, avgCost);
  }

  /** 직접 부모 캐시 (nodeId → parent node) */
  private directParentCache = new Map<string, any | null>();

  /**
   * 원본 노드의 직접 부모 찾기 (Figma 트리에서). 결과 캐싱.
   */
  private findDirectParent(nodeId: string): any | null {
    if (this.directParentCache.has(nodeId)) return this.directParentCache.get(nodeId)!;

    const variantRootId = this.nodeToVariantRoot.get(nodeId);
    if (!variantRootId) { this.directParentCache.set(nodeId, null); return null; }
    const { node: variantRoot } = this.dataManager.getById(variantRootId);
    if (!variantRoot) { this.directParentCache.set(nodeId, null); return null; }

    const find = (parent: any): any | null => {
      if (!parent?.children) return null;
      for (const child of parent.children) {
        if (child.id === nodeId) return parent;
        const result = find(child);
        if (result) return result;
      }
      return null;
    };
    const result = find(variantRoot);
    this.directParentCache.set(nodeId, result);
    return result;
  }


  /**
   * 노드가 직접 부모보다 큰지 판정 (overflow = 터치 영역 오버레이).
   * Figma에서 Interaction hit area는 부모보다 큰 FRAME으로 구현됨.
   */
  private isOverflowNode(node: InternalNode): boolean {
    if (!node.mergedNodes?.[0]) return false;
    const origNode = this.dataManager.getById(node.mergedNodes[0].id)?.node as any;
    if (!origNode?.absoluteBoundingBox) return false;
    const parent = this.findDirectParent(node.mergedNodes[0].id);
    if (!parent?.absoluteBoundingBox) return false;
    const pos = this.layoutNormalizer.normalize(parent, origNode);
    if (!pos) return false;
    return pos.relWidth > 1 || pos.relHeight > 1;
  }

  /**
   * Shape 노드의 크기 유사도 검증 (비율 1.3 이내)
   * 중심점이 동일한 동심원(22x22 vs 16x16)이 같은 노드로 매칭되는 것을 방지
   */
  private isSimilarSize(nodeA: InternalNode, nodeB: InternalNode): boolean {
    if (!nodeA.mergedNodes?.[0] || !nodeB.mergedNodes?.[0]) return true;
    const origA = this.dataManager.getById(nodeA.mergedNodes[0].id)?.node as any;
    const origB = this.dataManager.getById(nodeB.mergedNodes[0].id)?.node as any;
    const boxA = origA?.absoluteBoundingBox;
    const boxB = origB?.absoluteBoundingBox;
    if (!boxA || !boxB) return true;
    const minW = Math.min(boxA.width, boxB.width);
    const minH = Math.min(boxA.height, boxB.height);
    if (minW <= 0 || minH <= 0) return true;
    const wRatio = Math.max(boxA.width, boxB.width) / minW;
    const hRatio = Math.max(boxA.height, boxB.height) / minH;
    return wRatio <= 1.3 && hRatio <= 1.3;
  }

  /**
   * 노드가 속한 variant root의 bounds 조회
   */
  private getVariantRootBounds(
    node: InternalNode
  ): { x: number; y: number; width: number; height: number } | null {
    if (!node.mergedNodes || node.mergedNodes.length === 0) return null;
    const originalId = node.mergedNodes[0].id;
    const variantRoot = this.findOriginalVariantRoot(originalId);
    if (!variantRoot) return null;
    const bounds = (variantRoot as any).absoluteBoundingBox as
      | { x: number; y: number; width: number; height: number }
      | undefined;
    return bounds && bounds.width > 0 && bounds.height > 0 ? bounds : null;
  }

  /**
   * 원본 variant 루트 찾기
   */
  private findOriginalVariantRoot(nodeId: string): SceneNode | null {
    const variantRootId = this.nodeToVariantRoot.get(nodeId);
    if (!variantRootId) return null;

    const { node } = this.dataManager.getById(variantRootId);
    return node || null;
  }

  /**
   * TEXT 노드 특별 매칭: 같은 이름 + 같은 부모 타입
   */
  private isSameTextNode(nodeA: InternalNode, nodeB: InternalNode): boolean {
    if (nodeA.type !== "TEXT" || nodeB.type !== "TEXT") {
      return false;
    }

    if (nodeA.name !== nodeB.name) {
      return false;
    }

    const parentAType = nodeA.parent?.type;
    const parentBType = nodeB.parent?.type;

    // 부모 타입이 같으면 같은 역할의 텍스트로 간주
    return !!(parentAType && parentBType && parentAType === parentBType);
  }

  /**
   * INSTANCE 노드 특별 매칭:
   * 1. componentId가 다르면:
   *    - 같은 componentSetId에 속하면 → 같은 노드 (variant 병합)
   *    - 다른 componentSetId이면 → 다른 노드
   * 2. componentPropertyReferences.visible이 같으면 같은 노드로 판단
   *
   * 주의: 같은 componentId는 여기서 매칭하지 않음.
   * 같은 컴포넌트가 여러 위치에 사용될 수 있으므로 (예: leftIcon, rightIcon)
   * 위치 비교(Step 4)에 의존해야 함.
   */
  private isSameInstanceNode(
    nodeA: InternalNode,
    nodeB: InternalNode
  ): boolean {
    if (nodeA.type !== "INSTANCE" || nodeB.type !== "INSTANCE") {
      return false;
    }

    // componentId 비교 없이 visible ref 기반 fallback
    const visRefA = nodeA.componentPropertyReferences?.visible;
    const visRefB = nodeB.componentPropertyReferences?.visible;

    // 둘 다 visible ref가 있으면 ref로 비교
    if (visRefA && visRefB) {
      return visRefA === visRefB;
    }

    return false;
  }

}
