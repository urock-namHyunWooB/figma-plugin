/**
 * IComponentHeuristic Interface
 *
 * 컴포넌트 유형별 휴리스틱 인터페이스.
 * 각 휴리스틱이 자신의 컴포넌트 유형 판별과 처리를 모두 담당합니다.
 *
 * 각 휴리스틱은:
 * 1. canProcess()로 자신이 처리할 수 있는 컴포넌트인지 판별
 * 2. process()로 컴포넌트 구조 분석 및 semanticType 설정
 */

import type { ComponentType } from "@code-generator/types/architecture";
import type { BuildContext } from "../../workers/BuildContext";

/**
 * 컴포넌트별 휴리스틱 인터페이스
 */
export interface IComponentHeuristic {
  /** 이 휴리스틱이 처리하는 컴포넌트 유형 */
  readonly componentType: ComponentType;

  /** 휴리스틱 이름 (디버깅용) */
  readonly name: string;

  /**
   * 이 휴리스틱이 해당 컴포넌트를 처리할 수 있는지 판별
   *
   * @param ctx BuildContext
   * @returns 처리 가능 여부
   */
  canProcess(ctx: BuildContext): boolean;

  /**
   * 컴포넌트 분석 및 처리
   *
   * @param ctx BuildContext
   * @returns 처리된 BuildContext (semanticType 등 추가)
   */
  process(ctx: BuildContext): BuildContext;
}
