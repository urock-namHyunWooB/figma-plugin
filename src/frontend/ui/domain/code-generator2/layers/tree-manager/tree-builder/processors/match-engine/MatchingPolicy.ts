/**
 * 매칭 엔진의 모든 튜닝 파라미터를 한 곳에 모은 정책 객체.
 *
 * 원칙:
 * - 매직 넘버는 코드에 흩어지면 안 된다 — 전부 이 파일에 모음
 * - Phase 1a 값 = 기존 NodeMatcher의 하드코딩 값을 정확히 복사 (행동 보존)
 * - Phase 1b에서만 값 변경 (relativeSizeMaxRatio 1.3 → 2.0)
 * - 값 변경 시 반드시 Phase 1b Task에 기록 + audit 재측정
 */
export interface MatchingPolicy {
  /** 정규화된 위치 비용 임계값. cost ≤ 이 값이면 위치 일치로 간주. (기존 0.1) */
  readonly normalizedPositionThreshold: number;
  /** 크기 비율 최대 허용값. max/min > 이 값이면 RelativeSize 신호가 veto. (Phase 1b: 2.0 — 완화됨) */
  readonly relativeSizeMaxRatio: number;
  /** variant root 크기 유사도 판정 비율. overflow penalty 적용 여부 결정. (기존 1.5) */
  readonly variantRootSimilarityRatio: number;
  /** overflow↔normal 교차 매칭 시 cost 가산. (기존 +0.5) */
  readonly overflowMismatchPenalty: number;
  /** TEXT 특별 매칭 시 고정 cost. (기존 0.05) */
  readonly textSpecialMatchCost: number;
  /** INSTANCE 특별 매칭 시 고정 cost. (기존 0.05) */
  readonly instanceSpecialMatchCost: number;
  /** 엔진이 match로 결정하는 totalCost 임계값. totalCost ≤ 이 값 → match. */
  readonly matchCostThreshold: number;
  /** 각 신호의 가중치. Phase 1a는 전부 1. */
  readonly signalWeights: {
    readonly TypeCompatibility: number;
    readonly IdMatch: number;
    readonly NormalizedPosition: number;
    readonly RelativeSize: number;
  };
}

/**
 * Phase 1a 기본 정책. 기존 NodeMatcher 동작을 정확히 재현한다.
 * Phase 1b 시작 시점에 relativeSizeMaxRatio만 2.0으로 완화될 예정.
 */
export const defaultMatchingPolicy: MatchingPolicy = {
  normalizedPositionThreshold: 0.1,
  relativeSizeMaxRatio: 2.0, // Phase 1b: 완화됨 (원래 1.3, audit 45건 size-variant-reject 회귀 해소)
  variantRootSimilarityRatio: 1.5,
  overflowMismatchPenalty: 0.5,
  textSpecialMatchCost: 0.05,
  instanceSpecialMatchCost: 0.05,
  // Phase 2 cost form 재설계: 신호들이 legacy raw posCost와 호환되는 cost를 반환.
  // 최대 cost: NormalizedPosition 0.1 + OverflowPenalty 0.5 = 0.6
  // (TextSpecial/InstanceSpecial 0.05는 NormalizedPosition과 동시 발생 안 함 - decisive 또는 별 path)
  // matchCostThreshold = 0.6으로 잡으면 legacy `getPositionCost <= 0.6` 동등.
  // Hungarian은 상대 순서 + threshold 위반시 Infinity만 보므로 0.6이 안전.
  matchCostThreshold: 0.6,
  signalWeights: {
    TypeCompatibility: 1,
    IdMatch: 1,
    NormalizedPosition: 1,
    RelativeSize: 1,
  },
};
