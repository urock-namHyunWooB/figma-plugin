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

const BUTTON_NAME_PATTERNS: RegExp[] = [
  /button/i,
  /^btn$/i,
  /^cta$/i,
];

export class ButtonHeuristic extends GenericHeuristic {
  readonly componentType = "button" as const;
  readonly name = "ButtonHeuristic";

  canProcess(ctx: BuildContext): boolean {
    const name = ctx.data.document.name;
    return BUTTON_NAME_PATTERNS.some((pattern) => pattern.test(name));
  }

  // 버튼은 GenericHeuristic의 stateMapping 그대로 사용
  // Hover, Pressed, Disabled → :hover, :active, :disabled

  // 향후 버튼 특수 처리 추가 시 여기서 override
  // processStyles(ctx: BuildContext): BuildContext { ... }
}
