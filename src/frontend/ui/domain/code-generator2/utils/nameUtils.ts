/**
 * nameUtils
 *
 * 컴포넌트 이름 정규화 유틸리티
 */

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
