/**
 * RadioHeuristic
 *
 * 라디오 버튼 컴포넌트 휴리스틱.
 *
 * 판별 기준 (canProcess):
 * - 이름 패턴: radio, radio-button, radio-group
 *
 * 현재는 GenericHeuristic과 동일한 동작.
 * 향후 라디오 특화 처리 추가 시 override.
 */

import type { BuildContext } from "../../workers/BuildContext";
import { GenericHeuristic } from "./GenericHeuristic";

export class RadioHeuristic extends GenericHeuristic {
  readonly componentType = "radio" as const;
  readonly name = "RadioHeuristic";

  /** 매칭 임계점 */
  private static readonly MATCH_THRESHOLD = 10;

  /**
   * Radio 컴포넌트 매칭 점수 계산
   *
   * 점수 기준:
   * - radio: +10
   * - radio-button, radio-group: +12
   */
  score(ctx: BuildContext): number {
    let score = 0;
    const name = ctx.data.document.name;

    if (/radio/i.test(name)) score += 10;
    if (/radio.?button/i.test(name)) score += 12;
    if (/radio.?group/i.test(name)) score += 12;

    return score;
  }

  canProcess(ctx: BuildContext): boolean {
    return this.score(ctx) >= RadioHeuristic.MATCH_THRESHOLD;
  }

  // 향후 Radio 특수 처리
  // - selected state → :checked pseudo-class
  // - radio group 내 상호 배타적 선택 처리
}
