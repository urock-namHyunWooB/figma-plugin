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
  
  // 유효한 단어가 없는 경우 (이모지, 특수문자만 있는 경우)
  // 원본 key에서 숫자 ID를 추출하여 fallback 이름 생성
  if (words.length === 0) {
    return extractFallbackPropName(key);
  }

  const first = words[0].toLowerCase();
  const rest = words
    .slice(1)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");

  return first + rest;
}

/**
 * 특수문자/이모지만 있는 prop 이름에서 fallback 이름 생성
 * 예: "✏️ %#1408:0" → "prop1408_0"
 * 예: "#123:456" → "prop123_456"
 * 예: "🎨" → "" (숫자 없으면 빈 문자열)
 */
function extractFallbackPropName(key: string): string {
  // 숫자:숫자 또는 숫자 패턴 찾기
  const match = key.match(/(\d+:\d+|\d+)/);
  if (match) {
    // 콜론을 언더스코어로 변환
    return `prop${match[1].replace(":", "_")}`;
  }
  return "";
}
