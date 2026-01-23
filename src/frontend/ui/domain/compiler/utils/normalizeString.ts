/**
 * 컴포넌트 이름 정규화 (PascalCase, 특수문자 제거)
 * 한글/비ASCII 문자가 포함된 경우 fallback 이름 생성
 */
export function normalizeComponentName(name: string): string {
  // 먼저 영문/숫자만 추출 시도
  let normalized = name
    .replace(/[^a-zA-Z0-9\s]/g, "") // 특수문자 및 한글 제거
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");

  // 영문/숫자가 없으면 (한글만 있는 경우 등) fallback 이름 생성
  if (!normalized || normalized.length === 0) {
    // 원본 이름에서 고유한 해시 생성
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
export function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // 32bit 정수로 변환
  }
  return Math.abs(hash).toString(36).substring(0, 6);
}

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

  const result = first + rest;

  // 숫자로 시작하면 앞에 _ 추가 (JavaScript 식별자는 숫자로 시작할 수 없음)
  if (/^[0-9]/.test(result)) {
    return "_" + result;
  }

  return result;
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
