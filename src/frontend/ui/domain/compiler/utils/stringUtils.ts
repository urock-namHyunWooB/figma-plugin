/**
 * 첫 글자를 대문자로 변환
 */
export function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * 이름을 변수명으로 정규화
 */
export function normalizeName(name: string): string {
  return name
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9_$]/g, "")
    .replace(/^[0-9]/, "_$&"); // 숫자로 시작하면 앞에 _ 추가
}

export const toStringName = (object: Record<string, string>) => {
  // 키를 정렬하여 일관된 문자열 생성
  const sortedEntries = Object.entries(object).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  return sortedEntries.map(([key, value]) => `${key}=${value}`).join("|");
};
