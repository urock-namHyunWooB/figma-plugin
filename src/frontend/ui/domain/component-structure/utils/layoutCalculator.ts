import type { StructureElement } from "../types";

/**
 * 레이아웃 계산 유틸리티
 * 순수 함수만 포함
 */

/**
 * 요소의 상대 위치 계산 (부모 기준)
 */
export function calculateRelativePosition(
  element: StructureElement,
  parentX: number = 0,
  parentY: number = 0,
): { x: number; y: number } {
  return {
    x: element.x - parentX,
    y: element.y - parentY,
  };
}

/**
 * 스케일 팩터 계산 (캔버스 크기에 맞추기)
 */
export function calculateScale(
  componentWidth: number,
  componentHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  padding: number = 20,
): number {
  const availableWidth = canvasWidth - padding * 2;
  const availableHeight = canvasHeight - padding * 2;

  const scaleX = availableWidth / componentWidth;
  const scaleY = availableHeight / componentHeight;

  // 더 작은 스케일 사용 (전체가 보이도록)
  return Math.min(scaleX, scaleY, 1); // 최대 1배 (확대하지 않음)
}

/**
 * 요소의 bounding box 계산
 */
export function calculateBoundingBox(elements: StructureElement[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} {
  if (elements.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const processElement = (element: StructureElement) => {
    minX = Math.min(minX, element.x);
    minY = Math.min(minY, element.y);
    maxX = Math.max(maxX, element.x + element.width);
    maxY = Math.max(maxY, element.y + element.height);

    if (element.children) {
      element.children.forEach(processElement);
    }
  };

  elements.forEach(processElement);

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * 요소가 클릭 가능한 영역인지 확인
 */
export function isPointInElement(
  x: number,
  y: number,
  element: StructureElement,
  scale: number = 1,
): boolean {
  const scaledX = element.x * scale;
  const scaledY = element.y * scale;
  const scaledWidth = element.width * scale;
  const scaledHeight = element.height * scale;

  return (
    x >= scaledX &&
    x <= scaledX + scaledWidth &&
    y >= scaledY &&
    y <= scaledY + scaledHeight
  );
}
