/**
 * ButtonHeuristic
 *
 * 버튼 컴포넌트 휴리스틱.
 *
 * 판별 기준 (canProcess):
 * - 이름 패턴: button, btn, cta
 *
 * 현재는 GenericHeuristic과 동일한 동작.
 * 향후 버튼 특화 처리 추가 시 override.
 */

import type { BuildContext } from "../../workers/BuildContext";
import { GenericHeuristic } from "./GenericHeuristic";

export class ButtonHeuristic extends GenericHeuristic {
  readonly componentType = "button" as const;
  readonly name = "ButtonHeuristic";

  /** 매칭 임계점 */
  private static readonly MATCH_THRESHOLD = 10;

  /**
   * Button 컴포넌트 매칭 점수 계산
   *
   * 점수 기준:
   * - button: +10
   * - btn (독립): +10
   * - cta (독립): +10
   * - primary, secondary 등 수식어: +3
   */
  score(ctx: BuildContext): number {
    let score = 0;
    const name = ctx.data.document.name;

    if (/button/i.test(name)) score += 10;
    if (/^btn$/i.test(name)) score += 10;
    if (/^cta$/i.test(name)) score += 10;

    // 버튼 수식어 가산점
    if (/primary/i.test(name)) score += 3;
    if (/secondary/i.test(name)) score += 3;
    if (/tertiary/i.test(name)) score += 3;

    return score;
  }

  canProcess(ctx: BuildContext): boolean {
    return this.score(ctx) >= ButtonHeuristic.MATCH_THRESHOLD;
  }

  // 버튼은 GenericHeuristic의 stateMapping 그대로 사용
  // Hover, Pressed, Disabled → :hover, :active, :disabled

  // 향후 버튼 특수 처리 추가 시 여기서 override
  // processStyles(ctx: BuildContext): BuildContext { ... }
}
