/**
 * Node Type 관련 유틸리티 함수
 *
 * Figma 노드 타입 판별을 위한 공유 함수들
 */

import type { DesignNodeType } from "@compiler/types/architecture";

/**
 * Figma 타입 → DesignNodeType 매핑 테이블
 */
export const FIGMA_TO_DESIGN_TYPE: Record<string, DesignNodeType> = {
  // Container types
  FRAME: "container",
  GROUP: "container",
  COMPONENT: "container",
  COMPONENT_SET: "container",
  SECTION: "container",

  // Text type
  TEXT: "text",

  // Vector types
  VECTOR: "vector",
  LINE: "vector",
  ELLIPSE: "vector",
  RECTANGLE: "vector",
  STAR: "vector",
  POLYGON: "vector",
  BOOLEAN_OPERATION: "vector",

  // Component reference
  INSTANCE: "component",
};

/**
 * Figma 노드 타입을 DesignNodeType으로 변환
 */
export function mapNodeType(figmaType: string): DesignNodeType {
  return FIGMA_TO_DESIGN_TYPE[figmaType] ?? "container";
}

/**
 * 노드가 외부 컴포넌트 참조(INSTANCE)인지 확인
 */
export function isComponentReference(figmaType: string): boolean {
  return figmaType === "INSTANCE";
}

/**
 * 노드가 컨테이너 타입인지 확인
 */
export function isContainerType(figmaType: string): boolean {
  return mapNodeType(figmaType) === "container";
}

/**
 * 노드가 벡터 그래픽인지 확인
 */
export function isVectorType(figmaType: string): boolean {
  return mapNodeType(figmaType) === "vector";
}

/**
 * 노드가 텍스트인지 확인
 */
export function isTextType(figmaType: string): boolean {
  return figmaType === "TEXT";
}
