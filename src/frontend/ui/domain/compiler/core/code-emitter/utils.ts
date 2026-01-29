/**
 * CodeEmitter Utilities
 */

/**
 * 문자열을 PascalCase로 변환
 *
 * @example
 * toPascalCase("select-button") // "SelectButton"
 * toPascalCase("select button") // "SelectButton"
 * toPascalCase("select_button") // "SelectButton"
 * toPascalCase("TestButton")    // "TestButton" (이미 PascalCase면 유지)
 * toPascalCase("testButton")    // "TestButton"
 */
export function toPascalCase(str: string): string {
  // 1. 특수문자를 공백으로 변환
  // 2. camelCase/PascalCase 경계에서 분리 (예: "testButton" → "test Button")
  return str
    .replace(/[^a-zA-Z0-9]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

/**
 * 문자열을 camelCase로 변환
 *
 * @example
 * toCamelCase("select-button") // "selectButton"
 */
export function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}
