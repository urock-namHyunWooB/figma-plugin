/**
 * String Utilities
 *
 * Worker들에서 공통으로 사용하는 문자열 변환 유틸리티
 */

/**
 * 문자열을 camelCase로 변환
 * 숫자로 시작하는 결과는 _ 접두사를 추가하여 유효한 식별자로 변환
 *
 * @example
 * toCamelCase("Show Icon") // "showIcon"
 * toCamelCase("button-primary") // "buttonPrimary"
 * toCamelCase("Header/Sub") // "headerSub"
 * toCamelCase("063112") // "_063112"
 * toCamelCase("withLabel") // "withLabel" (preserves existing camelCase)
 * toCamelCase("RightIcon") // "rightIcon" (lowercases first char only)
 */
export function toCamelCase(str: string): string {
  // 이미 유효한 식별자인 경우 (특수문자/공백 없음), 첫 글자만 소문자로 변환
  if (/^[a-zA-Z][a-zA-Z0-9]*$/.test(str)) {
    const result = str.charAt(0).toLowerCase() + str.slice(1);
    return result;
  }

  const result = str
    .replace(/[^a-zA-Z0-9]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) =>
      index === 0
        ? word.charAt(0).toLowerCase() + word.slice(1)
        : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join("");

  // 숫자로 시작하면 앞에 _ 추가 (유효한 JavaScript 식별자로 변환)
  if (/^[0-9]/.test(result)) {
    return `_${result}`;
  }
  return result;
}

/**
 * 문자열을 PascalCase로 변환 (컴포넌트 이름용)
 *
 * @example
 * toPascalCase("button primary") // "ButtonPrimary"
 * toPascalCase("Header/Sub") // "Headersub"
 * toPascalCase("icon-anchor") // "Iconanchor"
 */
export function toPascalCase(str: string): string {
  // 특수문자 제거 (공백 유지), 공백으로 분리, 첫 글자 대문자 + 나머지 소문자
  return str
    .replace(/[^a-zA-Z0-9\s]/g, "")
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

/**
 * 유효한 JavaScript 식별자로 변환
 * 숫자로 시작하는 문자열은 앞에 _ 접두사를 추가
 *
 * @example
 * toValidIdentifier("063112") // "_063112"
 * toValidIdentifier("show063112") // "show063112"
 * toValidIdentifier("123Text") // "_123Text"
 */
export function toValidIdentifier(str: string): string {
  if (!str) return str;
  // 숫자로 시작하면 앞에 _ 추가
  if (/^[0-9]/.test(str)) {
    return `_${str}`;
  }
  return str;
}
