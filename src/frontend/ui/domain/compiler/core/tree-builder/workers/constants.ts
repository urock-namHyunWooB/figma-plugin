/**
 * TreeBuilder Constants
 *
 * IoU 임계값 등 TreeBuilder에서 사용하는 상수 정의
 */

export const TreeBuilderConstants = {
  /**
   * 일반 노드 IoU 임계값 (80%)
   * 두 노드가 같은 노드인지 판단하는 기준
   * - 위치와 크기가 80% 이상 겹치면 같은 노드로 판단
   */
  IOU_THRESHOLD: 0.8,

  /**
   * TEXT 노드 IoU 임계값 (10%)
   * 텍스트는 variant마다 내용이 달라 크기가 자주 변함
   * - 낮은 임계값으로 위치만 비슷하면 같은 노드로 판단
   */
  TEXT_IOU_THRESHOLD: 0.1,

  /**
   * 스쿼시 IoU 임계값 (50%)
   * 병합 후 중복 노드 정리 기준
   * - 50% 이상 겹치는 같은 타입의 노드를 하나로 병합
   */
  SQUASH_IOU_THRESHOLD: 0.5,
} as const;

// 타입 추출을 위한 유틸리티
export type TreeBuilderConstantsType = typeof TreeBuilderConstants;
