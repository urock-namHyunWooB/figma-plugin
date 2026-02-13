/**
 * BuildContext
 *
 * Pipeline을 통해 전달되는 상태 객체 타입 정의.
 * 각 Processor의 static 메서드가 BuildContext를 받아 확장된 BuildContext를 반환합니다.
 */

import type {
  StyleDefinition,
  DesignNodeType,
  PropDefinition,
  SlotDefinition,
  ArraySlotInfo,
  ConditionalRule,
  SemanticRole,
  SemanticType,
  TreeBuilderPolicy,
  DesignNode,
  PreparedDesignData,
  ComponentType,
} from "@code-generator/types/architecture";
import type { ConditionNode } from "@code-generator/types/customType";
import type { InternalNode } from "./interfaces/core";

// ============================================================================
// BuildContext 관련 타입
// ============================================================================

export interface SemanticRoleEntry {
  role: SemanticRole;
  vectorSvg?: string;
}

export interface ExternalRefData {
  componentSetId: string;
  componentName: string;
  props: Record<string, string>;
  /**
   * Prop 이름 매핑 (외부 컴포넌트 prop → 부모 컴포넌트 prop)
   * 예: { labelText: "option1Text" }
   * ComponentGenerator에서 labelText 대신 option1Text를 참조하도록 함
   */
  propMappings?: Record<string, string>;
}

/**
 * 노드의 시맨틱 정보 (휴리스틱 결과)
 */
export interface SemanticTypeEntry {
  type: SemanticType;
  /** textInput일 때 placeholder 텍스트 */
  placeholder?: string;
}

// ============================================================================
// BuildContext
// ============================================================================

export interface BuildContext {
  // 입력 데이터 (불변)
  readonly data: PreparedDesignData;
  readonly policy?: TreeBuilderPolicy;
  readonly totalVariantCount: number;

  // Phase 1: 구조 생성
  internalTree?: InternalNode;
  propsMap?: Map<string, PropDefinition>;

  // Phase 2: 분석
  semanticRoles?: Map<string, SemanticRoleEntry>;
  hiddenConditions?: Map<string, ConditionNode>;

  // Phase 3: 노드별 변환 결과 (nodeId → 값)
  nodeTypes?: Map<string, DesignNodeType>;
  nodeStyles?: Map<string, StyleDefinition>;
  nodePropBindings?: Map<string, Record<string, string>>;
  nodeExternalRefs?: Map<string, ExternalRefData>;
  nodeSemanticTypes?: Map<string, SemanticTypeEntry>;

  // Phase 4: 최종 결과
  root?: DesignNode;
  conditionals: ConditionalRule[];
  slots: SlotDefinition[];
  arraySlots: ArraySlotInfo[];

  // Heuristics 결과
  /** 컴포넌트 유형 (ComponentTypeDetector 결과) */
  componentType?: ComponentType;

  /** 스타일/조건에서 제외할 prop 이름들 (휴리스틱으로 제거된 prop) */
  excludePropsFromStyles?: Set<string>;
}
