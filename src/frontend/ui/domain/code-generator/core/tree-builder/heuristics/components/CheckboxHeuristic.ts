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

const CHECKBOX_NAME_PATTERNS: RegExp[] = [
  /checkbox/i,
  /check.?box/i,
];

export class CheckboxHeuristic extends GenericHeuristic {
  readonly componentType = "checkbox" as const;
  readonly name = "CheckboxHeuristic";

  canProcess(ctx: BuildContext): boolean {
    const name = ctx.data.document.name;
    return CHECKBOX_NAME_PATTERNS.some((pattern) => pattern.test(name));
  }

  // 향후 Checkbox 특수 처리
  // - checked state → :checked pseudo-class
  // - indeterminate state 처리
}
