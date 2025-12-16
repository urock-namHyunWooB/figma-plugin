/**
 * props 키를 camelCase로 변환
 * - "Size" → "size"
 * - "Left Icon" → "leftIcon"
 * - "Label#89:6" → "label"
 */
export function toCamelCase(key: string) {
  // # 이후 제거 (예: "Label#89:6" → "Label")
  const hashIndex = key.indexOf("#");
  const hasIdSuffix = hashIndex !== -1;
  const cleanKey = hasIdSuffix ? key.slice(0, hashIndex) : key;

  // 공백으로 분리 후 camelCase 변환
  const words = cleanKey.split(" ").filter((w) => w.length > 0);

  const camelKey = words
    .map((word, index) => {
      if (index === 0) {
        // 첫 단어는 전부 소문자
        return word.toLowerCase();
      }
      // 나머지 단어는 첫 글자만 대문자
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join("");

  return camelKey;
}
