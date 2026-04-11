import type { InternalNode } from "../../../../../../types/types";
import type DataManager from "../../../../../data-manager/DataManager";
import type { LayoutNormalizer } from "../LayoutNormalizer";
import type { MatchingPolicy } from "./MatchingPolicy";
import type { NodePresence } from "../NodePresenceScanner";

/**
 * 매칭 컨텍스트. 신호가 평가에 사용하는 모든 외부 의존성을 한 곳에 모음.
 */
export interface MatchContext {
  readonly dataManager: DataManager;
  readonly layoutNormalizer: LayoutNormalizer;
  readonly nodeToVariantRoot: ReadonlyMap<string, string>;
  readonly policy: MatchingPolicy;
  /** 노드 presence 정보 (BooleanPositionSwap 조건부 노드 판별용) */
  readonly nodePresence?: NodePresence;
}

/**
 * 한 신호의 평가 결과.
 *
 * discriminated union (Phase 2 cost form 재설계):
 * - kind="veto": 결정적 거부. 엔진은 즉시 match 불가, totalCost=Infinity.
 * - kind="decisive-match": 결정적 수용. 엔진은 즉시 match, totalCost=0.
 *   다른 신호의 veto도 override한다.
 * - kind="decisive-match-with-cost": 결정적 수용 + 명시적 cost. 엔진은 즉시 match,
 *   totalCost=cost. 이후 신호는 평가하지 않는다 (mutually-exclusive 신호용 — TextSpecial/InstanceSpecial).
 * - kind="match-with-cost": 매치이지만 cost 기여 (legacy raw posCost와 동일 형태).
 *   이 cost가 엔진 totalCost에 누적된다 (NormalizedPosition + OverflowPenalty 처럼 additive).
 * - kind="neutral": 이 신호는 적용 불가, totalCost에 0 기여.
 * - kind="score": 0~1 사이 점수. 보조 신호 (booster)에 사용. weight × (1-score)가 cost 기여.
 *
 * reason은 사람이 읽는 디버그 문자열 — reason log에 누적되어 결정 근거를 재구성한다.
 */
export type SignalResult =
  | { kind: "veto"; reason: string }
  | { kind: "decisive-match"; reason: string }
  | { kind: "decisive-match-with-cost"; cost: number; reason: string }
  | { kind: "match-with-cost"; cost: number; reason: string }
  | { kind: "neutral"; reason: string }
  | { kind: "score"; score: number; reason: string };

/**
 * 매칭 신호 인터페이스.
 *
 * 신호는 순수 함수처럼 동작해야 한다:
 * - 같은 (a, b, ctx) 입력 → 같은 SignalResult 출력 (결정론)
 * - 신호 간 부작용 없음 (독립 평가 가능)
 * - 외부 상태 변경 금지
 */
export interface MatchSignal {
  /** 신호 이름. reason log와 디버깅에 사용. */
  readonly name: string;
  /** 두 노드 간 평가. */
  evaluate(a: InternalNode, b: InternalNode, ctx: MatchContext): SignalResult;
}

/**
 * 엔진의 최종 결정.
 *
 * signalResults는 각 신호가 기여한 내역 — reason log로 사용.
 * veto가 하나라도 있으면 decision="veto"이고 totalCost=Infinity.
 * 아니면 totalCost = Σ weight_i × (1 - score_i).
 */
export interface MatchDecision {
  decision: "match" | "veto";
  totalCost: number;
  signalResults: ReadonlyArray<{
    signalName: string;
    result: SignalResult;
    weight: number;
  }>;
}
