// Production-grade UUID generator (Crypto API unavailable in sandbox fallback)
export function generateUUID(): string {
  // 피그마 플러그인 샌드박스에서도 안전하게 동작하는 난수 생성
  let d = new Date().getTime();
  let d2 =
    (typeof performance !== "undefined" &&
      performance.now &&
      performance.now() * 1000) ||
    0;
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    let r = Math.random() * 16;
    if (d > 0) {
      r = (d + r) % 16 | 0;
      d = Math.floor(d / 16);
    } else {
      r = (d2 + r) % 16 | 0;
      d2 = Math.floor(d2 / 16);
    }
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Safe Accessor for figma.mixed
// figma.mixed에 접근하면 플러그인이 충돌하므로 반드시 이 함수를 통해 값을 가져와야 함
export function safeGet<T>(value: T | typeof figma.mixed, fallback: T): T {
  return value === figma.mixed ? fallback : value;
}

// src/utils/math.ts

/**
 * 두 문자열 사이의 편집 거리를 계산 (0.0 ~ 1.0)
 * 1.0: 완전 일치
 * 0.0: 완전 불일치
 */
export function getLevenshteinSimilarity(s1: string, s2: string): number {
  const a = s1.trim();
  const b = s2.trim();

  if (a.length === 0) return b.length === 0 ? 1.0 : 0.0;
  if (b.length === 0) return 0.0;

  // 두 문자열이 같으면 빠른 반환
  if (a === b) return 1.0;

  const matrix = [];

  // 초기화
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // 거리 계산
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // 교체
          Math.min(
            matrix[i][j - 1] + 1, // 삽입
            matrix[i - 1][j] + 1 // 삭제
          )
        );
      }
    }
  }

  const distance = matrix[b.length][a.length];
  const maxLength = Math.max(a.length, b.length);

  return 1.0 - distance / maxLength;
}

// src/utils/style-map.ts

// 테스트 데이터의 styleTree 타입 정의
interface StyleNode {
  id: string;
  cssStyle: Record<string, string>;
  children?: StyleNode[];
}

/**
 * 트리 형태의 styleTree를 "ID: CSS" 형태의 Map으로 변환
 */
export function createStyleMap(
  styleTreeRoot: StyleNode
): Map<string, Record<string, string>> {
  const map = new Map<string, Record<string, string>>();

  function traverse(node: StyleNode) {
    // 1. 맵에 등록
    if (node.cssStyle) {
      map.set(node.id, node.cssStyle);
    }
    // 2. 자식 순회
    if (node.children) {
      node.children.forEach(traverse);
    }
  }

  traverse(styleTreeRoot);
  return map;
}
