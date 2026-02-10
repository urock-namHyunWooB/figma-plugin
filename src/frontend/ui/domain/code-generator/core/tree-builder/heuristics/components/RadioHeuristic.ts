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

const RADIO_NAME_PATTERNS: RegExp[] = [
  /radio/i,
  /radio.?button/i,
  /radio.?group/i,
];

export class RadioHeuristic extends GenericHeuristic {
  readonly componentType = "radio" as const;
  readonly name = "RadioHeuristic";

  canProcess(ctx: BuildContext): boolean {
    const name = ctx.data.document.name;
    return RADIO_NAME_PATTERNS.some((pattern) => pattern.test(name));
  }

  // 향후 Radio 특수 처리
  // - selected state → :checked pseudo-class
  // - radio group 내 상호 배타적 선택 처리
}
