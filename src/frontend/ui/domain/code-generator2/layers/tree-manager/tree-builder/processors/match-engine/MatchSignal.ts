import type { InternalNode } from "../../../../../types/types";
import type DataManager from "../../../../data-manager/DataManager";
import type { LayoutNormalizer } from "../LayoutNormalizer";
import type { MatchingPolicy } from "./MatchingPolicy";

/**
 * 매칭 컨텍스트. 신호가 평가에 사용하는 모든 외부 의존성을 한 곳에 모음.
 */
export interface MatchContext {
  readonly dataManager: DataManager;
  readonly layoutNormalizer: LayoutNormalizer;
  readonly nodeToVariantRoot: ReadonlyMap<string, string>;
  readonly policy: MatchingPolicy;
}

/**
 * 한 신호의 평가 결과.
 *
 * discriminated union:
 * - kind="veto": 결정적 거부. 엔진은 즉시 match 불가로 결정.
 * - kind="score": 0~1 사이 점수. 1=완벽 일치, 0=전혀 맞지 않음.
 *
 * reason은 사람이 읽는 디버그 문자열 — reason log에 누적되어 결정 근거를 재구성할 수 있게 한다.
 */
export type SignalResult =
  | { kind: "veto"; reason: string }
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
