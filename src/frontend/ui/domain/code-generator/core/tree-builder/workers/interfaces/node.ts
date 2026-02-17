/**
 * Node Interfaces
 *
 * NodeTypeMapper, SemanticRoleDetector 인터페이스
 */

import type { DesignNodeType, SemanticRole, PreparedDesignData } from "@code-generator/types/architecture";

// ============================================================================
// NodeTypeMapper Interface
// ============================================================================

/**
 * Figma 노드 타입을 내부 DesignNodeType으로 매핑하는 인터페이스
 */
export interface INodeTypeMapper {
  /**
   * Figma 노드 타입을 DesignNodeType으로 매핑
   * @param figmaType - Figma 노드 타입 (예: "FRAME", "TEXT", "INSTANCE" 등)
   * @returns 매핑된 DesignNodeType
   */
  mapNodeType(figmaType: string): DesignNodeType;

  /**
   * 컴포넌트 참조 타입인지 확인
   * @param figmaType - Figma 노드 타입
   * @returns INSTANCE 타입 여부
   */
  isComponentReference(figmaType: string): boolean;
}

// ============================================================================
// SemanticRoleDetector Interface
// ============================================================================

/**
 * Semantic Role 감지에 사용되는 노드 구조
 * @property id - 노드 고유 ID
 * @property type - 노드 타입
 * @property name - 노드 이름
 * @property parent - 부모 노드 참조
 * @property children - 자식 노드 배열
 */
export interface SemanticNode {
  id: string;
  type: string;
  name: string;
  parent: SemanticNode | null;
  children: SemanticNode[];
}

/**
 * Semantic Role 감지 결과
 * @property role - 감지된 semantic role
 * @property isTextSlot - 텍스트 슬롯 여부
 * @property vectorSvg - 벡터 SVG 문자열
 * @property variantSvgs - variant별 SVG 맵
 */
export interface SemanticRoleResult {
  role: SemanticRole;
  isTextSlot?: boolean;
  vectorSvg?: string;
  variantSvgs?: Record<string, string>;
}

/**
 * 노드의 semantic role을 감지하는 인터페이스
 */
export interface ISemanticRoleDetector {
  /**
   * 버튼 컴포넌트인지 확인
   * @param componentName - 컴포넌트 이름
   * @returns 버튼 컴포넌트 여부
   */
  isButtonComponent(componentName: string): boolean;

  /**
   * 노드의 semantic role 결정
   * @param node - Semantic 노드
   * @param data - 전처리된 디자인 데이터
   * @param rootName - 루트 컴포넌트 이름
   * @returns Semantic role 결과
   */
  detectSemanticRole(
    node: SemanticNode,
    data: PreparedDesignData,
    rootName: string
  ): SemanticRoleResult;

  /**
   * 트리 전체에 semantic role 적용
   * @param root - 루트 노드
   * @param data - 전처리된 디자인 데이터
   * @returns 노드 ID와 semantic role 결과의 맵
   */
  applySemanticRoles(
    root: SemanticNode,
    data: PreparedDesignData
  ): Map<string, SemanticRoleResult>;
}
