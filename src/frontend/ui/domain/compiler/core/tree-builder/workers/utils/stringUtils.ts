/**
 * String Utilities
 *
 * Worker들에서 공통으로 사용하는 문자열 변환 유틸리티
 */

/**
 * 문자열을 camelCase로 변환
 *
 * @example
 * toCamelCase("Show Icon") // "showIcon"
 * toCamelCase("button-primary") // "buttonPrimary"
 * toCamelCase("Header/Sub") // "headerSub"
 */
export function toCamelCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) =>
      index === 0
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join("");
}

/**
 * 문자열을 PascalCase로 변환 (컴포넌트 이름용)
 *
 * @example
 * toPascalCase("button primary") // "ButtonPrimary"
 * toPascalCase("Header/Sub") // "HeaderSub"
 */
export function toPascalCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

/**
 * 문자열을 kebab-case로 변환
 *
 * @example
 * toKebabCase("ShowIcon") // "show-icon"
 * toKebabCase("buttonPrimary") // "button-primary"
 */
export function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}
