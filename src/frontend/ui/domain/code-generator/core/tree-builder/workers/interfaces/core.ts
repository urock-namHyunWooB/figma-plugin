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

/** Figma Stroke 타입 */
export interface FigmaStroke {
  type: string;
  visible?: boolean;
  color?: { r: number; g: number; b: number; a?: number };
}

/** Figma Effect 타입 */
export interface FigmaEffect {
  type: string;
  visible?: boolean;
  radius?: number;
  color?: { r: number; g: number; b: number; a?: number };
  offset?: { x: number; y: number };
}

/** Component Property Value 타입 */
export type ComponentPropertyValue = string | boolean | { type: string; [key: string]: unknown };

// ============================================================================
// Core Node Types
// ============================================================================

export interface MergedNodeWithVariant {
  id: string;
  name: string;
  variantName?: string | null;
}

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
}

// Re-export FigmaFill for convenience
export type { FigmaFill };
