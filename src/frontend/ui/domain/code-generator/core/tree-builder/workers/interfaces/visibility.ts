/**
 * Visibility Interfaces
 *
 * VisibilityDetector, VisibilityResolver, ConditionParser, HiddenNodeProcessor 인터페이스
 */

import type { PropDefinition, ConditionalRule, PreparedDesignData } from "@code-generator/types/architecture";
import type { ConditionNode, VisibleValue } from "@code-generator/types/customType";
import type { MergedNodeWithVariant } from "./core";

// ============================================================================
// VisibilityDetector Interface
// ============================================================================

/**
 * Visibility 감지 인터페이스
 */
export interface IVisibilityDetector {
  /**
   * 노드의 visibility 조건 추론
   * @param mergedNodes - 병합된 노드 정보 배열
   * @param totalVariantCount - 전체 variant 수
   * @param visibleRef - visible 참조 문자열 (선택적)
   * @param parseCondition - variant 이름을 ConditionNode로 파싱하는 함수 (선택적)
   * @returns VisibleValue
   */
  inferVisibility(
    mergedNodes: MergedNodeWithVariant[],
    totalVariantCount: number,
    visibleRef?: string,
    parseCondition?: (variantName: string) => ConditionNode | null
  ): VisibleValue;

  /**
   * ConditionalRule 생성
   * @param nodeId - 노드 ID
   * @param condition - ConditionNode
   * @returns ConditionalRule
   */
  createConditionalRule(nodeId: string, condition: ConditionNode): ConditionalRule;

  /**
   * mergedNodes에서 visibility 패턴 분석
   * @param mergedNodes - 병합된 노드 정보 배열
   * @param totalVariantCount - 전체 variant 수
   * @returns visibility 패턴 ("always", "never", "conditional")
   */
  analyzeVisibilityPattern(
    mergedNodes: MergedNodeWithVariant[],
    totalVariantCount: number
  ): "always" | "never" | "conditional";

  /**
   * 특정 variant에서 노드가 visible인지 확인
   * @param mergedNodes - 병합된 노드 정보 배열
   * @param variantName - 확인할 variant 이름
   * @returns visible 여부
   */
  isVisibleInVariant(mergedNodes: MergedNodeWithVariant[], variantName: string): boolean;
}

// ============================================================================
// HiddenNodeProcessor Interface
// ============================================================================

/**
 * Hidden 노드 처리에 사용되는 노드 구조
 * @property id - 노드 ID
 * @property name - 노드 이름
 * @property componentPropertyReferences - 컴포넌트 속성 참조 (선택적)
 */
export interface HiddenProcessableNode {
  id: string;
  name: string;
  componentPropertyReferences?: Record<string, string>;
}

/**
 * Hidden 노드 처리 결과
 * @property nodeId - 노드 ID
 * @property condition - ConditionNode
 * @property propName - prop 이름
 * @property propDefinition - PropDefinition
 */
export interface HiddenNodeResult {
  nodeId: string;
  condition: ConditionNode;
  propName: string;
  propDefinition: PropDefinition;
}

/**
 * Hidden 노드 처리 인터페이스
 */
export interface IHiddenNodeProcessor {
  /**
   * 노드가 hidden인지 확인
   * @param node - 확인할 노드
   * @param data - 전처리된 디자인 데이터
   * @returns hidden 여부
   */
  isHiddenNode(node: HiddenProcessableNode, data: PreparedDesignData): boolean;

  /**
   * hidden 노드 처리 (showXxx prop 생성)
   * @param node - 처리할 노드
   * @returns HiddenNodeResult 또는 null
   */
  processHiddenNode(node: HiddenProcessableNode): HiddenNodeResult | null;

  /**
   * 여러 hidden 노드 일괄 처리
   * @param nodes - 처리할 노드 배열
   * @returns 처리 결과와 새로 생성된 props
   */
  processAllHiddenNodes(nodes: HiddenProcessableNode[]): {
    results: HiddenNodeResult[];
    newProps: PropDefinition[];
  };

  /**
   * show prop 이름 생성
   * @param nodeName - 노드 이름
   * @returns 생성된 show prop 이름 (예: "showIcon")
   */
  generateShowPropName(nodeName: string): string;
}

// ============================================================================
// VisibilityResolver Interface
// ============================================================================

/**
 * Visibility 해결 입력 데이터
 * @property nodeId - 노드 ID
 * @property mergedNodes - 병합된 노드 정보 배열
 * @property visibleRef - visible 참조 문자열 (선택적)
 * @property hiddenCondition - hidden 조건 (선택적)
 */
export interface VisibilityInput {
  nodeId: string;
  mergedNodes: MergedNodeWithVariant[];
  visibleRef?: string;
  hiddenCondition?: ConditionNode;
}

/**
 * Visibility 해결 결과
 * @property conditionalRule - ConditionalRule (선택적)
 * @property type - visibility 타입 ("always", "conditional", "hidden")
 * @property propBinding - prop 바인딩 문자열 (선택적)
 */
export interface VisibilityResult {
  conditionalRule?: ConditionalRule;
  type: "always" | "conditional" | "hidden";
  propBinding?: string;
}

/**
 * Visibility 해결 인터페이스
 */
export interface IVisibilityResolver {
  /**
   * 노드의 visibility 조건을 종합적으로 해결
   * @param input - VisibilityInput
   * @param totalVariantCount - 전체 variant 수
   * @param propsMap - PropDefinition 맵
   * @param parseCondition - variant 이름을 ConditionNode로 파싱하는 함수
   * @returns VisibilityResult
   */
  resolveVisibility(
    input: VisibilityInput,
    totalVariantCount: number,
    propsMap: Map<string, PropDefinition>,
    parseCondition: (variantName: string) => ConditionNode | null
  ): VisibilityResult;
}

// ============================================================================
// ConditionParser Interface
// ============================================================================

/**
 * 조건 파싱 인터페이스
 */
export interface IConditionParser {
  /**
   * variant 이름에서 조건 파싱
   * @param variantName - variant 이름 (예: "State=Hover, Size=Large")
   * @returns ConditionNode 또는 null
   */
  parseVariantCondition(variantName: string): ConditionNode | null;

  /**
   * prop 이름으로 boolean 조건 생성
   * @param propName - prop 이름
   * @returns ConditionNode
   */
  createPropCondition(propName: string): ConditionNode;

  /**
   * visible 참조에서 prop 이름 추출
   * @param visibleRef - visible 참조 문자열
   * @param propsMap - PropDefinition 맵
   * @returns prop 이름 또는 null
   */
  extractPropNameFromRef(
    visibleRef: string,
    propsMap: Map<string, PropDefinition>
  ): string | null;
}
