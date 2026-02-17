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

/**
 * 노드의 의미론적 역할 엔트리
 * @property role - 노드의 시맨틱 역할 (root, text, icon, image, vector, container 등)
 * @property vectorSvg - 벡터 노드의 SVG 문자열 (선택사항)
 */
export interface SemanticRoleEntry {
  role: SemanticRole;
  vectorSvg?: string;
}

/**
 * 외부 컴포넌트 참조 데이터
 * INSTANCE 노드가 참조하는 외부 컴포넌트 정보
 * @property componentSetId - 참조하는 컴포넌트 세트 ID
 * @property componentName - PascalCase로 변환된 컴포넌트 이름
 * @property props - variant props + override props
 * @property propMappings - Prop 이름 매핑 (외부 컴포넌트 prop → 부모 컴포넌트 prop)
 */
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
 * @property type - 시맨틱 타입 (textInput 등)
 * @property placeholder - textInput일 때 placeholder 텍스트
 */
export interface SemanticTypeEntry {
  type: SemanticType;
  /** textInput일 때 placeholder 텍스트 */
  placeholder?: string;
}

// ============================================================================
// BuildContext
// ============================================================================

/**
 * TreeBuilder 파이프라인의 컨텍스트 객체
 * 각 Processor가 이 객체를 받아 처리 결과를 추가하여 반환합니다.
 *
 * @property data - 입력 데이터 (불변, PreparedDesignData)
 * @property policy - 트리 빌더 정책 설정 (선택사항)
 * @property totalVariantCount - 전체 variant 수
 * @property internalTree - Phase 1에서 생성된 내부 트리
 * @property propsMap - Phase 1에서 추출된 props 정의 맵
 * @property semanticRoles - Phase 2에서 감지된 노드별 시맨틱 역할
 * @property hiddenConditions - Phase 2에서 분석된 hidden 노드 조건
 * @property nodeTypes - Phase 3에서 매핑된 노드별 DesignNodeType
 * @property nodeStyles - Phase 3에서 빌드된 노드별 StyleDefinition
 * @property nodePropBindings - Phase 3에서 생성된 노드별 prop 바인딩
 * @property nodeExternalRefs - Phase 3에서 생성된 노드별 외부 참조 정보
 * @property nodeSemanticTypes - Phase 3에서 설정된 노드별 시맨틱 타입
 * @property root - Phase 4에서 생성된 최종 DesignNode 트리
 * @property conditionals - Phase 4에서 생성된 조건부 렌더링 규칙
 * @property slots - Phase 4에서 감지된 슬롯 정의
 * @property arraySlots - Phase 4에서 감지된 배열 슬롯 정보
 * @property componentType - Heuristics에서 감지된 컴포넌트 유형
 * @property excludePropsFromStyles - 스타일/조건에서 제외할 prop 이름들
 */
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
