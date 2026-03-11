/**
 * 휴리스틱 공용 prop 이름 패턴 매칭
 *
 * Figma prop 이름은 디자인 시스템마다 다를 수 있으므로
 * (disable / disabled / isDisabled 등) 유연한 매칭이 필요하다.
 */

/** state, states 등 */
export function isStateProp(name: string): boolean {
  return /^states?$/i.test(name);
}

/** disable, disabled, isDisabled 등 */
export function isDisableProp(name: string): boolean {
  return name.toLowerCase().includes("disable");
}

/** checked, isChecked, selected, isSelected 등 */
export function isCheckedProp(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes("checked") || lower.includes("selected");
}

/** active, on, toggled, enabled, selected, checked 등 (Switch/Toggle용) */
const TOGGLE_PATTERNS = [
  "active",
  "on",
  "toggled",
  "enabled",
  "selected",
  "checked",
];

export function isToggleProp(name: string): boolean {
  const lower = name.toLowerCase();
  return TOGGLE_PATTERNS.some((p) => lower.includes(p));
}
