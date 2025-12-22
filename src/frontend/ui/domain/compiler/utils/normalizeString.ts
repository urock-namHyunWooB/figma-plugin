export function toCamelCase(key: string) {
  // 1) # 이후 제거 (예: "Label#89:6" → "Label")
  const hashIndex = key.indexOf("#");
  const cleanKey = hashIndex !== -1 ? key.slice(0, hashIndex) : key;

  // 2) 단어 경계 정규화
  // - 하이픈/언더스코어/공백/점/슬래시/콜론 등은 구분자로 처리
  // - camelCase/PascalCase 경계도 분리: "FontSize" -> "Font Size"
  const normalized = cleanKey
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2") // aB -> a B
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2") // URLValue -> URL Value
    .replace(/[^a-zA-Z0-9]+/g, " "); // 나머지 특수문자 전부 공백으로

  const words = normalized.split(" ").filter(Boolean);
  if (words.length === 0) return "";

  const first = words[0].toLowerCase();
  const rest = words
    .slice(1)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");

  return first + rest;
}
