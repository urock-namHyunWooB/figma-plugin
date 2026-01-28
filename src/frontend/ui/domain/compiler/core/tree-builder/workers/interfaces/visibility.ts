/**
 * Visibility Interfaces
 *
 * VisibilityDetector, VisibilityResolver, ConditionParser, HiddenNodeProcessor 인터페이스
 */

import type { PropDefinition, ConditionalRule, PreparedDesignData } from "@compiler/types/architecture";
import type { ConditionNode, VisibleValue } from "@compiler/types/customType";
import type { MergedNodeWithVariant } from "./core";

// ============================================================================
// VisibilityDetector Interface
// ============================================================================

export interface IVisibilityDetector {
  /** 노드의 visibility 조건 추론 */
  inferVisibility(
    mergedNodes: MergedNodeWithVariant[],
    totalVariantCount: number,
    visibleRef?: string,
    parseCondition?: (variantName: string) => ConditionNode | null
  ): VisibleValue;

  /** ConditionalRule 생성 */
  createConditionalRule(nodeId: string, condition: ConditionNode): ConditionalRule;

  /** mergedNodes에서 visibility 패턴 분석 */
  analyzeVisibilityPattern(
    mergedNodes: MergedNodeWithVariant[],
    totalVariantCount: number
  ): "always" | "never" | "conditional";

  /** 특정 variant에서 노드가 visible인지 확인 */
  isVisibleInVariant(mergedNodes: MergedNodeWithVariant[], variantName: string): boolean;
}

// ============================================================================
// HiddenNodeProcessor Interface
// ============================================================================

export interface HiddenProcessableNode {
  id: string;
  name: string;
  componentPropertyReferences?: Record<string, string>;
}

export interface HiddenNodeResult {
  nodeId: string;
  condition: ConditionNode;
  propName: string;
  propDefinition: PropDefinition;
}

export interface IHiddenNodeProcessor {
  /** 노드가 hidden인지 확인 */
  isHiddenNode(node: HiddenProcessableNode, data: PreparedDesignData): boolean;

  /** hidden 노드 처리 (showXxx prop 생성) */
  processHiddenNode(node: HiddenProcessableNode): HiddenNodeResult | null;

  /** 여러 hidden 노드 일괄 처리 */
  processAllHiddenNodes(nodes: HiddenProcessableNode[]): {
    results: HiddenNodeResult[];
    newProps: PropDefinition[];
  };

  /** show prop 이름 생성 */
  generateShowPropName(nodeName: string): string;
}

// ============================================================================
// VisibilityResolver Interface
// ============================================================================

export interface VisibilityInput {
  nodeId: string;
  mergedNodes: MergedNodeWithVariant[];
  visibleRef?: string;
  hiddenCondition?: ConditionNode;
}

export interface VisibilityResult {
  conditionalRule?: ConditionalRule;
  type: "always" | "conditional" | "hidden";
  propBinding?: string;
}

export interface IVisibilityResolver {
  /** 노드의 visibility 조건을 종합적으로 해결 */
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

export interface IConditionParser {
  /** variant 이름에서 조건 파싱 */
  parseVariantCondition(variantName: string): ConditionNode | null;

  /** prop 이름으로 boolean 조건 생성 */
  createPropCondition(propName: string): ConditionNode;

  /** visible 참조에서 prop 이름 추출 */
  extractPropNameFromRef(
    visibleRef: string,
    propsMap: Map<string, PropDefinition>
  ): string | null;
}
