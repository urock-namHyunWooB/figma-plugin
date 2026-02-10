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

const TOGGLE_NAME_PATTERNS: RegExp[] = [
  /toggle/i,
  /switch/i,
];

export class ToggleHeuristic extends GenericHeuristic {
  readonly componentType = "toggle" as const;
  readonly name = "ToggleHeuristic";

  // stateMapping 확장 (On/Off 추가)
  get stateMapping(): Record<string, PseudoClass | null> {
    return {
      ...this.baseStateMapping,
      on: ":checked",
      off: null,
    };
  }

  canProcess(ctx: BuildContext): boolean {
    const name = ctx.data.document.name;
    return TOGGLE_NAME_PATTERNS.some((pattern) => pattern.test(name));
  }

  // 향후 Toggle 특수 처리
  // - On/Off → data-state 또는 aria-checked
  // - 애니메이션 트랜지션 스타일
}
