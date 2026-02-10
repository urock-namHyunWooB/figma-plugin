/**
 * ToggleHeuristic
 *
 * 토글/스위치 컴포넌트 휴리스틱.
 *
 * 판별 기준 (canProcess):
 * - 이름 패턴: toggle, switch
 *
 * stateMapping 확장:
 * - on → :checked
 * - off → null (기본 상태)
 */

import type { PseudoClass } from "@code-generator/types/customType";
import type { BuildContext } from "../../workers/BuildContext";
import { GenericHeuristic } from "./GenericHeuristic";

export class ToggleHeuristic extends GenericHeuristic {
  readonly componentType = "toggle" as const;
  readonly name = "ToggleHeuristic";

  /** 매칭 임계점 */
  private static readonly MATCH_THRESHOLD = 10;

  // stateMapping 확장 (On/Off 추가)
  get stateMapping(): Record<string, PseudoClass | null> {
    return {
      ...this.baseStateMapping,
      on: ":checked",
      off: null,
    };
  }

  /**
   * Toggle 컴포넌트 매칭 점수 계산
   *
   * 점수 기준:
   * - toggle: +10
   * - switch: +10
   */
  score(ctx: BuildContext): number {
    let score = 0;
    const name = ctx.data.document.name;

    if (/toggle/i.test(name)) score += 10;
    if (/switch/i.test(name)) score += 10;

    return score;
  }

  canProcess(ctx: BuildContext): boolean {
    return this.score(ctx) >= ToggleHeuristic.MATCH_THRESHOLD;
  }

  // 향후 Toggle 특수 처리
  // - On/Off → data-state 또는 aria-checked
  // - 애니메이션 트랜지션 스타일
}
