/**
 * CheckboxHeuristic
 *
 * 체크박스 컴포넌트 휴리스틱.
 *
 * 판별 기준 (canProcess):
 * - 이름 패턴: checkbox, check-box
 *
 * 현재는 GenericHeuristic과 동일한 동작.
 * 향후 체크박스 특화 처리 추가 시 override.
 */

import type { BuildContext } from "../../workers/BuildContext";
import { GenericHeuristic } from "./GenericHeuristic";

export class CheckboxHeuristic extends GenericHeuristic {
  readonly componentType = "checkbox" as const;
  readonly name = "CheckboxHeuristic";

  /** 매칭 임계점 */
  private static readonly MATCH_THRESHOLD = 10;

  /**
   * Checkbox 컴포넌트 매칭 점수 계산
   *
   * 점수 기준:
   * - checkbox, check-box: +10
   */
  score(ctx: BuildContext): number {
    let score = 0;
    const name = ctx.data.document.name;

    if (/checkbox/i.test(name)) score += 10;
    if (/check.?box/i.test(name)) score += 10;

    return score;
  }

  canProcess(ctx: BuildContext): boolean {
    return this.score(ctx) >= CheckboxHeuristic.MATCH_THRESHOLD;
  }

  // 향후 Checkbox 특수 처리
  // - checked state → :checked pseudo-class
  // - indeterminate state 처리
}
