/**
 * 첫 글자를 대문자로 변환
 * @param str - 변환할 문자열
 * @returns 첫 글자가 대문자로 변환된 문자열
 */
export function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * 이름을 변수명으로 정규화
 * JavaScript/TypeScript 변수명으로 사용할 수 있도록 특수문자 제거 및 숫자 시작 처리
 * @param name - 정규화할 이름
 * @returns JavaScript 변수명으로 사용 가능한 문자열
 */
export function normalizeName(name: string): string {
  return name
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9_$]/g, "")
    .replace(/^[0-9]/, "_$&"); // 숫자로 시작하면 앞에 _ 추가
}

/**
 * 객체를 문자열 키로 변환
 * 키를 정렬하여 일관된 문자열을 생성하며, 캐싱이나 비교에 사용
 * @param object - 변환할 문자열 값 객체
 * @returns "key=value|key=value" 형식의 문자열
 * @example
 * toStringName({ b: "2", a: "1" }) // "a=1|b=2"
 */
export const toStringName = (object: Record<string, string>) => {
  // 키를 정렬하여 일관된 문자열 생성
  const sortedEntries = Object.entries(object).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  return sortedEntries.map(([key, value]) => `${key}=${value}`).join("|");
};
