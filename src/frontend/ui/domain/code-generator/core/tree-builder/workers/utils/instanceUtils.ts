/**
 * Instance 관련 유틸리티 함수
 *
 * INSTANCE 노드 ID 처리를 위한 공유 함수들
 */

/**
 * Figma Fill 타입
 * @property type - Fill 타입 (예: "SOLID", "GRADIENT_LINEAR" 등)
 * @property visible - Fill 가시성 여부
 * @property color - Fill 색상 (RGBA)
 */
export interface FigmaFill {
  type: string;
  visible?: boolean;
  color?: {
    r: number;
    g: number;
    b: number;
    a?: number;
  };
}

/**
 * ID가 INSTANCE 자식 노드인지 확인
 *
 * INSTANCE 자식 노드의 ID는 "I"로 시작하는 복합 ID 형태
 * 예: "I704:56;704:29;692:1613"
 * @param id - 확인할 노드 ID
 * @returns INSTANCE 자식 노드 여부
 */
export function isInstanceChildId(id: string): boolean {
  return id.startsWith("I");
}

/**
 * INSTANCE ID에서 원본 노드 ID 추출
 *
 * @param instanceId - INSTANCE 자식 노드의 복합 ID
 * @returns 원본 노드 ID
 * @example
 * getOriginalId("I704:56;704:29;692:1613") // "692:1613"
 * getOriginalId("123:456") // "123:456"
 */
export function getOriginalId(instanceId: string): string {
  if (!instanceId.startsWith("I")) return instanceId;
  const parts = instanceId.split(";");
  return parts[parts.length - 1];
}

/**
 * fills 배열에서 색상 추출
 * @param fills - FigmaFill 배열
 * @returns 추출된 색상 문자열 (HEX 또는 RGBA) 또는 null
 */
export function extractColorFromFills(fills: FigmaFill[]): string | null {
  if (!fills || fills.length === 0) return null;

  const fill = fills[0];
  if (fill.type !== "SOLID" || !fill.color) return null;

  const { r, g, b, a } = fill.color;
  const toHex = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");

  if (a !== undefined && a < 1) {
    return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
  }
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}
