/**
 * GenericHeuristic
 *
 * 기본 휴리스틱 (fallback)
 * 다른 휴리스틱에 매칭되지 않을 때 사용
 *
 * - score(): 항상 0 반환
 * - apply(): componentType: "unknown" 반환
 */

import type { ComponentType } from "../../../../types/types";
import type {
  IHeuristic,
  HeuristicContext,
  HeuristicResult,
} from "./IHeuristic";

export class GenericHeuristic implements IHeuristic {
  readonly name = "GenericHeuristic";
  readonly componentType: ComponentType = "unknown";

  /**
   * 매칭 점수 계산
   * GenericHeuristic은 fallback이므로 항상 0 반환
   */
  score(_ctx: HeuristicContext): number {
    return 0;
  }

  /**
   * semanticType 적용
   * 특별한 처리 없이 기본값 반환
   */
  apply(_ctx: HeuristicContext): HeuristicResult {
    return {
      componentType: this.componentType,
    };
  }
}
