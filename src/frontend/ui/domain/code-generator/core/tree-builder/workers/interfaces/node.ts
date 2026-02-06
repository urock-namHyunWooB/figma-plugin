/**
 * Node Interfaces
 *
 * NodeTypeMapper, SemanticRoleDetector 인터페이스
 */

import type { DesignNodeType, SemanticRole, PreparedDesignData } from "@code-generator/types/architecture";

// ============================================================================
// NodeTypeMapper Interface
// ============================================================================

export interface INodeTypeMapper {
  /** Figma 노드 타입을 DesignNodeType으로 매핑 */
  mapNodeType(figmaType: string): DesignNodeType;

  /** 컴포넌트 참조 타입인지 확인 */
  isComponentReference(figmaType: string): boolean;
}

// ============================================================================
// SemanticRoleDetector Interface
// ============================================================================

export interface SemanticNode {
  id: string;
  type: string;
  name: string;
  parent: SemanticNode | null;
  children: SemanticNode[];
}

export interface SemanticRoleResult {
  role: SemanticRole;
  isTextSlot?: boolean;
  vectorSvg?: string;
  variantSvgs?: Record<string, string>;
}

export interface ISemanticRoleDetector {
  /** 버튼 컴포넌트인지 확인 */
  isButtonComponent(componentName: string): boolean;

  /** 노드의 semantic role 결정 */
  detectSemanticRole(
    node: SemanticNode,
    data: PreparedDesignData,
    rootName: string
  ): SemanticRoleResult;

  /** 트리 전체에 semantic role 적용 */
  applySemanticRoles(
    root: SemanticNode,
    data: PreparedDesignData
  ): Map<string, SemanticRoleResult>;
}
