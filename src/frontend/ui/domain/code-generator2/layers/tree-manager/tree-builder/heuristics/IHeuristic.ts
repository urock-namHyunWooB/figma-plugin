/**
 * IHeuristic
 *
 * 컴포넌트 유형 판별 휴리스틱 인터페이스
 *
 * 역할:
 * 1. score() - 컴포넌트와의 매칭 점수 계산
 * 2. apply() - InternalTree에 semanticType 설정
 *
 * 점수 기준:
 * - 0: 불일치
 * - 10+: 이름 패턴 매칭 (button, input 등)
 * - 15+: 구조 패턴 매칭 (caret, checkbox 등)
 * - 20+: 복합 매칭 (이름 + 구조)
 */

import type { ComponentType, InternalTree } from "../../../../types/types";
import type DataManager from "../../../data-manager/DataManager";

/**
 * 휴리스틱 컨텍스트
 * score()와 apply()에 전달되는 공통 데이터
 */
export interface HeuristicContext {
  /** 내부 트리 (variant 병합 완료) */
  tree: InternalTree;
  /** 데이터 매니저 */
  dataManager: DataManager;
  /** 컴포넌트 이름 */
  componentName: string;
  /** componentPropertyDefinitions */
  propDefs: Record<string, ComponentPropertyDef> | undefined;
}

/**
 * Figma componentPropertyDefinitions 타입
 */
export interface ComponentPropertyDef {
  type: "VARIANT" | "BOOLEAN" | "TEXT" | "INSTANCE_SWAP";
  defaultValue?: string | boolean;
  variantOptions?: string[];
}

/**
 * 휴리스틱 적용 결과
 */
export interface HeuristicResult {
  /** 전체 컴포넌트 타입 */
  componentType: ComponentType;
  /** 루트 노드의 UINodeType 변경 여부 */
  rootNodeType?: "button" | "input" | "link";
}

/**
 * 컴포넌트 유형 판별 휴리스틱 인터페이스
 */
export interface IHeuristic {
  /** 휴리스틱 이름 (디버깅용) */
  readonly name: string;

  /** 이 휴리스틱이 판별하는 컴포넌트 타입 */
  readonly componentType: ComponentType;

  /**
   * 컴포넌트와의 매칭 점수 계산
   *
   * @param ctx 휴리스틱 컨텍스트
   * @returns 매칭 점수 (0 이상, 높을수록 적합)
   */
  score(ctx: HeuristicContext): number;

  /**
   * InternalTree에 semanticType 설정
   *
   * @param ctx 휴리스틱 컨텍스트
   * @returns 휴리스틱 적용 결과
   */
  apply(ctx: HeuristicContext): HeuristicResult;
}
