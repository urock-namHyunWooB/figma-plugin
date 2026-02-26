/**
 * nameUtils
 *
 * 컴포넌트 이름 정규화 유틸리티
 */

/**
 * JavaScript 예약어 목록
 */
const JS_RESERVED_WORDS = new Set([
  "break", "case", "catch", "continue", "debugger", "default", "delete",
  "do", "else", "finally", "for", "function", "if", "in", "instanceof",
  "new", "return", "switch", "this", "throw", "try", "typeof", "var",
  "void", "while", "with", "class", "const", "enum", "export", "extends",
  "import", "super", "implements", "interface", "let", "package", "private",
  "protected", "public", "static", "yield", "await", "async"
]);

/**
 * prop 이름이 예약어인 경우 안전한 이름으로 변환
 * 예: "default" → "isDefault"
 */
export function toSafePropName(name: string): string {
  if (JS_RESERVED_WORDS.has(name.toLowerCase())) {
    // boolean처럼 보이는 예약어는 is 접두사 추가
    if (name.toLowerCase() === "default") {
      return "isDefault";
    }
    // 그 외는 _ 접두사 추가
    return "_" + name;
  }
  return name;
}

/**
 * 컴포넌트 이름 정규화 (PascalCase, 특수문자 제거)
 * 밑줄(_), 하이픈(-), 공백을 단어 구분자로 처리
 *
 * 예:
 * - "icon_arrow" → "IconArrow"
 * - "my-component" → "MyComponent"
 * - "한글 이름" → fallback (Component{hash})
 * - "123button" → "_123button"
 */
export function toComponentName(name: string): string {
  // v1 호환: 특수문자(하이픈, 밑줄, 슬래시 등) 제거, 공백으로만 분리
  // "icon-anchor" → "iconanchor" → "Iconanchor"
  // "Header/Sub" → "HeaderSub" → "Headersub"
  let normalized = name
    .replace(/[^a-zA-Z0-9\s]/g, "") // 영문/숫자/공백만 보존
    .split(/\s+/) // 공백으로 분리
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");

  // 영문/숫자가 없으면 fallback 이름 생성
  if (!normalized || normalized.length === 0) {
    const hash = simpleHash(name);
    normalized = `Component${hash}`;
  }

  // 숫자로 시작하면 앞에 _ 추가
  if (/^[0-9]/.test(normalized)) {
    normalized = "_" + normalized;
  }

  return normalized;
}

/**
 * 간단한 해시 함수 (이름에서 고유한 숫자 생성)
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36).substring(0, 6);
}
