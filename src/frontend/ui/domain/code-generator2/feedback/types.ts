/**
 * Feedback 데이터 모델
 *
 * VariantInconsistency (엔진 출력) → FeedbackGroup (UI 소비용)
 */

/** 한 묶음의 피드백 (같은 nodeId + variant 좌표에서 동시에 터진 항목들) */
export interface FeedbackGroup {
  /** 안정적인 그룹 id (nodeId + variantKey 조합) */
  id: string;
  /** 컴포넌트 세트 이름 (표시용) */
  componentSetName: string;
  /** 그룹 헤더 요약 텍스트 — "Primary+Hover에서 색 3속성 일관성 깨짐" */
  rootCauseHint: string;
  /** 이 그룹이 공유하는 컨텍스트 */
  sharedContext: {
    /** 점프 대상 Figma 노드 id */
    nodeId: string;
    /** variant 좌표 (e.g., { Type: "Primary", State: "Hover" }) */
    variantCoordinate: Record<string, string>;
  };
  /** 원자 단위 피드백 항목들 */
  items: FeedbackItem[];
  /** 그룹 내 canAutoFix=true 항목이 1개라도 있으면 true */
  canAutoFixGroup: boolean;
}

export interface FeedbackItem {
  /** 안정적인 아이템 id */
  id: string;
  /** CSS 속성명 (예: "background") */
  cssProperty: string;
  /** 실제 값 (문제가 있는 variant의 값) */
  actualValue: string;
  /** 기대값 (다수결) — null이면 계산 불가 (동점 등) */
  expectedValue: string | null;
  /** 점프 대상 Figma 노드 id */
  nodeId: string;
  /** 이 항목의 variant 좌표 */
  variantCoordinate: Record<string, string>;
  /** 자동 fix 가능 여부 (expectedValue != null + 지원 속성) */
  canAutoFix: boolean;
  /** 사람이 읽을 이유 설명 */
  reason: string;
}
