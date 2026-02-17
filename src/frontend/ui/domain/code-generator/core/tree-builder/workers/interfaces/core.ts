/**
 * Core Types
 *
 * TreeBuilder 전체에서 공유되는 기본 타입 정의
 */

import type { FigmaFill } from "../utils/instanceUtils";
import type { ConditionalRule } from "@code-generator/types/architecture";

// ============================================================================
// Figma Types for Override Handling
// ============================================================================

/**
 * Figma Stroke 타입
 * @property type - Stroke 타입 (예: "SOLID", "GRADIENT_LINEAR" 등)
 * @property visible - Stroke 가시성 여부
 * @property color - Stroke 색상 (RGBA)
 */
export interface FigmaStroke {
  type: string;
  visible?: boolean;
  color?: { r: number; g: number; b: number; a?: number };
}

/**
 * Figma Effect 타입
 * @property type - Effect 타입 (예: "DROP_SHADOW", "INNER_SHADOW", "LAYER_BLUR" 등)
 * @property visible - Effect 가시성 여부
 * @property radius - Effect 반경
 * @property color - Effect 색상 (RGBA)
 * @property offset - Effect 오프셋 (x, y)
 */
export interface FigmaEffect {
  type: string;
  visible?: boolean;
  radius?: number;
  color?: { r: number; g: number; b: number; a?: number };
  offset?: { x: number; y: number };
}

/**
 * Component Property Value 타입
 * Figma 컴포넌트 속성 값으로 문자열, 불리언, 또는 객체 형태를 가질 수 있음
 */
export type ComponentPropertyValue = string | boolean | { type: string; [key: string]: unknown };

// ============================================================================
// Core Node Types
// ============================================================================

/**
 * 병합된 노드와 variant 정보
 * @property id - 노드 고유 ID
 * @property name - 노드 이름
 * @property variantName - variant 이름 (nullable)
 */
export interface MergedNodeWithVariant {
  id: string;
  name: string;
  variantName?: string | null;
}

/**
 * 내부 노드 구조
 * TreeBuilder에서 사용하는 중간 표현(IR) 트리의 노드
 * @property id - 노드 고유 ID
 * @property type - Figma 노드 타입
 * @property name - 노드 이름
 * @property parent - 부모 노드 참조
 * @property children - 자식 노드 배열
 * @property mergedNode - 병합된 variant 노드 정보 배열
 * @property bounds - 노드 경계 영역 (x, y, width, height)
 * @property conditions - Visibility 조건 (CSS 변환 불가능한 State 등)
 * @property inheritedLayoutMode - flatten된 FRAME의 layoutMode를 상속 (HORIZONTAL이면 flex-direction: row 적용)
 */
export interface InternalNode {
  id: string;
  type: string;
  name: string;
  parent: InternalNode | null;
  children: InternalNode[];
  mergedNode: MergedNodeWithVariant[];
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Visibility 조건 (CSS 변환 불가능한 State 등) */
  conditions?: ConditionalRule[];
  /** flatten된 FRAME의 layoutMode를 상속 (HORIZONTAL이면 flex-direction: row 적용) */
  inheritedLayoutMode?: "HORIZONTAL" | "VERTICAL";
}

// Re-export FigmaFill for convenience
export type { FigmaFill };
