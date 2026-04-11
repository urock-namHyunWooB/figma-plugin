import { InternalNode } from "../../../../../types/types";
import DataManager from "../../../../data-manager/DataManager";
import { LayoutNormalizer } from "./LayoutNormalizer";
import {
  createDefaultEngine,
  defaultMatchingPolicy,
  type MatchContext,
  type MatchDecisionEngine,
  type MatchDecision,
} from "./match-engine";

/**
 * NodeMatcher (Phase 2 후기 — 엔진 전면 위임)
 *
 * 두 InternalNode가 같은 역할을 하는지 판단하는 매칭 인터페이스.
 *
 * Phase 2 종료 시점:
 * - `isSameNode`, `isDefiniteMatch`, `getPositionCost` 모두 MatchDecisionEngine에 위임
 * - 매칭 로직 자체는 `processors/match-engine/signals/*` 에 신호로 분산
 * - 이 클래스는 VariantMerger와 엔진 사이의 thin wrapper 역할만 수행
 *
 * 외부 API 시그니처는 Phase 1 이전과 동일하게 유지 (caller 변경 불필요).
 */
export class NodeMatcher {
  /** Shape 계열 타입 — Figma가 같은 도형을 다른 타입으로 표현할 수 있으므로 상호 호환 */
  private static readonly SHAPE_TYPES = new Set([
    "RECTANGLE", "VECTOR", "ELLIPSE", "LINE", "STAR", "POLYGON", "BOOLEAN_OPERATION",
  ]);

  /** 컨테이너 계열 타입 — Figma가 variant에 따라 GROUP↔FRAME을 바꿀 수 있으므로 상호 호환 */
  private static readonly CONTAINER_TYPES = new Set(["GROUP", "FRAME"]);

  /** 매칭 결정 엔진 (Phase 2: 모든 매칭 결정의 주체) */
  private readonly engine: MatchDecisionEngine = createDefaultEngine();

  private _nodePresence?: import("./NodePresenceScanner").NodePresence;

  constructor(
    private readonly dataManager: DataManager,
    private readonly nodeToVariantRoot: Map<string, string>,
    private readonly layoutNormalizer: LayoutNormalizer,
  ) {}

  /** NodePresence 설정 (VariantMerger가 merge 전에 호출) */
  setNodePresence(presence: import("./NodePresenceScanner").NodePresence): void {
    this._nodePresence = presence;
  }

  /**
   * 두 노드가 같은 역할을 하는지 판단. 엔진에 완전 위임.
   */
  public isSameNode(nodeA: InternalNode, nodeB: InternalNode): boolean {
    return this.engine.decide(nodeA, nodeB, this.makeCtx()).decision === "match";
  }

  /**
   * Pass 1용: 확정 매칭 (타입 호환 + ID 일치).
   * 위치 비교 없이 결정적으로 매칭 가능한 쌍을 판별.
   *
   * 엔진의 IdMatch 신호와 동등하지만, Pass 1에서 빠른 ID-only 체크가 필요해
   * 별도 메서드 유지 (엔진을 거치는 것보다 빠름).
   */
  public isDefiniteMatch(nodeA: InternalNode, nodeB: InternalNode): boolean {
    if (nodeA.type !== nodeB.type) {
      const bothShapes =
        NodeMatcher.SHAPE_TYPES.has(nodeA.type) &&
        NodeMatcher.SHAPE_TYPES.has(nodeB.type);
      const bothContainers =
        NodeMatcher.CONTAINER_TYPES.has(nodeA.type) &&
        NodeMatcher.CONTAINER_TYPES.has(nodeB.type);
      if (!bothShapes && !bothContainers) return false;
    }
    return nodeA.id === nodeB.id;
  }

  /**
   * Pass 2용: 위치 기반 매칭 비용 반환. 엔진에 완전 위임.
   * 매칭 불가하면 Infinity 반환.
   *
   * Phase 2 cost form 재설계로 엔진의 totalCost가 legacy raw posCost와
   * 호환되는 형태가 됨. NormalizedPosition signal은 raw posCost를 그대로 반환.
   */
  public getPositionCost(nodeA: InternalNode, nodeB: InternalNode): number {
    const decision = this.engine.decide(nodeA, nodeB, this.makeCtx());

    const log = (globalThis as any).__MATCH_REASON_LOG__ as Array<unknown> | undefined;
    if (log) {
      log.push({
        pair: [nodeA.id, nodeB.id],
        decision: decision.decision,
        totalCost: decision.totalCost,
        signalResults: decision.signalResults,
        source: "engine-getPositionCost",
      });
    }

    return decision.totalCost;
  }

  /**
   * 두 노드의 full MatchDecision 반환. Observer용.
   * getPositionCost()와 같은 엔진 호출이지만 signalResults까지 전체 반환.
   */
  public getDecision(nodeA: InternalNode, nodeB: InternalNode): MatchDecision {
    return this.engine.decide(nodeA, nodeB, this.makeCtx());
  }

  private makeCtx(): MatchContext {
    return {
      dataManager: this.dataManager,
      layoutNormalizer: this.layoutNormalizer,
      nodeToVariantRoot: this.nodeToVariantRoot,
      policy: defaultMatchingPolicy,
      nodePresence: this._nodePresence,
    };
  }
}
