/**
 * State Utilities
 *
 * State prop 값과 CSS pseudo-class 변환 관련 유틸리티
 */

import type { PseudoClass } from "@compiler/types/customType";

/**
 * State prop 값과 CSS pseudo-class 매핑
 */
const STATE_TO_PSEUDO: Record<string, PseudoClass | null> = {
  // Hover states
  hover: ":hover",
  hovered: ":hover",
  hovering: ":hover",

  // Active states
  active: ":active",
  pressed: ":active",
  pressing: ":active",
  clicked: ":active",

  // Focus states
  focus: ":focus",
  focused: ":focus",
  "focus-visible": ":focus-visible",

  // Disabled states
  disabled: ":disabled",
  inactive: ":disabled",

  // Default states (no pseudo-class)
  default: null,
  normal: null,
  enabled: null,
  rest: null,
  idle: null,

  // Checked/Selected states
  selected: ":checked",
  checked: ":checked",

  // Visited state
  visited: ":visited",
};

/**
 * State 값이 CSS pseudo-class로 변환 가능한지 확인
 */
export function isCssConvertibleState(state: string): boolean {
  return state.toLowerCase() in STATE_TO_PSEUDO;
}

/**
 * State 값을 CSS pseudo-class로 변환
 * @returns PseudoClass | null (default state) | undefined (변환 불가)
 */
export function stateToPseudo(state: string): PseudoClass | null | undefined {
  const normalized = state.toLowerCase();
  if (normalized in STATE_TO_PSEUDO) {
    return STATE_TO_PSEUDO[normalized];
  }
  return undefined;
}
