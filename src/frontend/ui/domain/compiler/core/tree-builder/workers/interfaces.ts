/**
 * TreeBuilder Worker Interfaces
 *
 * 각 Worker의 인터페이스 정의
 * TreeBuilder는 이 인터페이스들을 통해 구현에 의존하지 않고 추상화에 의존합니다.
 */

import type {
  StyleDefinition,
  DesignNodeType,
  PropDefinition,
  SlotDefinition,
  ArraySlotInfo,
  ConditionalRule,
  SemanticRole,
  PreparedDesignData,
} from "@compiler/types/architecture";
import type { ConditionNode, VisibleValue, PseudoClass } from "@compiler/types/customType";
import type { FigmaFill } from "./utils/instanceUtils";

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
// Core Types - 다른 인터페이스에서 사용되는 기본 타입
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
}

// ============================================================================
// BuildContext (→ ./BuildContext.ts로 분리됨)
// ============================================================================

export type { BuildContext, SemanticRoleEntry, ExternalRefData } from "./BuildContext";

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
// StyleClassifier Interface
// ============================================================================

export interface VariantStyle {
  variantName: string;
  cssStyle: Record<string, string>;
}

export interface IStyleClassifier {
  /** variant 스타일들을 base/dynamic/pseudo로 분류 */
  classifyStyles(
    variantStyles: VariantStyle[],
    parseCondition: (variantName: string) => ConditionNode | null
  ): StyleDefinition;

  /** variant 이름에서 State 값 추출 */
  extractStateFromVariantName(variantName: string): string | null;

  /** State 값을 CSS pseudo-class로 변환 */
  stateToPseudo(state: string): PseudoClass | null | undefined;

  /** 두 스타일 객체의 차이 계산 */
  diffStyles(
    baseStyle: Record<string, string>,
    targetStyle: Record<string, string>
  ): Record<string, string>;

  /** 여러 스타일에서 공통 스타일 추출 */
  extractCommonStyles(styles: Array<Record<string, string>>): Record<string, string>;
}

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
// PropsLinker Interface
// ============================================================================

export interface PropBinding {
  bindingType: "text" | "visible" | "component";
  originalRef: string;
}

export interface IPropsLinker {
  /** componentPropertyReferences를 propBindings로 변환 */
  linkProps(
    refs: Record<string, string> | undefined,
    propsMap: Map<string, PropDefinition>
  ): Record<string, string>;

  /** refs에서 PropBinding 배열 추출 */
  extractPropBindings(refs: Record<string, string> | undefined): PropBinding[];

  /** 바인딩이 하나라도 있는지 확인 */
  hasAnyBinding(refs: Record<string, string> | undefined): boolean;
}

// ============================================================================
// SlotDetector Interface
// ============================================================================

export interface SlotCandidate {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  propName?: string;
  propType: "boolean" | "instance_swap" | "array";
}

export interface ISlotDetector {
  /** INSTANCE 노드가 slot으로 변환될 조건 확인 */
  shouldConvertToSlot(nodeType: string, visibleRef?: string, propType?: string): boolean;

  /** 노드에서 slot 정보 추출 */
  extractSlotDefinition(nodeId: string, nodeName: string, propName: string): SlotDefinition;

  /** 배열 슬롯 감지 */
  detectArraySlot(
    children: Array<{ id: string; name: string; type: string; componentId?: string }>
  ): ArraySlotInfo | null;

  /** 모든 slot 후보 찾기 */
  findSlotCandidates(
    nodes: Array<{
      id: string;
      name: string;
      type: string;
      componentPropertyReferences?: Record<string, string>;
    }>,
    propsDefinitions: Record<string, { type: string }>
  ): SlotCandidate[];
}

// ============================================================================
// VariantMerger Interface
// ============================================================================

export interface IVariantMerger {
  /** 여러 variant를 병합하여 InternalNode 트리 생성 */
  mergeVariants(variants: SceneNode[], data: PreparedDesignData): InternalNode;

  /** 단일 SceneNode를 InternalNode로 변환 */
  convertToInternalNode(
    node: SceneNode,
    parent: InternalNode | null,
    variantName: string,
    data: PreparedDesignData
  ): InternalNode;

  /** 두 노드의 IoU 계산 */
  calculateIoU(box1: DOMRect, box2: DOMRect): number;

  /** 두 노드가 같은 노드인지 확인 (IoU 기반) */
  isSameNode(node1: SceneNode, node2: SceneNode, threshold?: number): boolean;
}

// ============================================================================
// InstanceOverrideHandler Interface
// ============================================================================

export interface OverrideInfo {
  originalId: string;
  instanceId: string;
  overrides: {
    characters?: string;
    visible?: boolean;
    fills?: FigmaFill[];
    strokes?: FigmaStroke[];
    effects?: FigmaEffect[];
    opacity?: number;
    cornerRadius?: number;
    componentProperties?: Record<string, ComponentPropertyValue>;
  };
}

export interface IInstanceOverrideHandler {
  /** INSTANCE ID에서 원본 노드 ID 추출 */
  getOriginalId(instanceId: string): string;

  /** ID가 INSTANCE 자식 노드인지 확인 */
  isInstanceChildId(id: string): boolean;

  /** INSTANCE children에서 override 정보 추출 */
  extractOverrides(instanceChildren: SceneNode[], originalChildren: SceneNode[]): OverrideInfo[];

  /** INSTANCE override를 원본 노드에 적용 */
  mergeOverridesToOriginal(originalChildren: SceneNode[], instanceChildren: SceneNode[]): SceneNode[];

  /** INSTANCE 노드에서 variant props 추출 */
  extractVariantProps(instanceNode: SceneNode, data: PreparedDesignData): Record<string, string>;

  /** INSTANCE에서 오버라이드된 속성을 props 형태로 추출 */
  extractOverrideProps(instanceNode: SceneNode, originalChildren: SceneNode[]): Record<string, string>;
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
// PositionStyler Interface
// ============================================================================

export interface PositionResult {
  position: string;
  left?: string;
  top?: string;
  right?: string;
  bottom?: string;
}

/** Position 계산에 사용되는 노드 구조 */
export interface PositionableNode {
  id: string;
  type: string;
  name: string;
  children: PositionableNode[];
  styles: StyleDefinition | Record<string, string>;
}

export interface IPositionStyler {
  /** 노드의 position 스타일 계산 */
  calculatePosition(
    node: PositionableNode,
    parent: PositionableNode | null,
    data: PreparedDesignData
  ): PositionResult | null;

  /** auto-layout 여부 확인 */
  isAutoLayout(node: SceneNode): boolean;

  /** 회전된 요소 처리 */
  handleRotatedElement(nodeSpec: SceneNode, styles: Record<string, string>): Record<string, string>;
}

// ============================================================================
// SquashByIou Interface
// ============================================================================

export interface ISquashByIou {
  /** IoU 기반으로 노드 트리 스쿼시 */
  squashByIou(trees: InternalNode[], threshold?: number): InternalNode;
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

// ============================================================================
// TextSlotDetector Interface
// ============================================================================

export interface TextSlotInput {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  mergedNodeIds: string[];
}

export interface TextSlotResult {
  shouldConvert: boolean;
  propName?: string;
  propDefinition?: PropDefinition;
}

export interface ITextSlotDetector {
  /** TEXT 노드가 text slot으로 변환되어야 하는지 확인 */
  shouldConvertToTextSlot(
    mergedNodeIds: string[],
    totalVariantCount: number,
    data: PreparedDesignData
  ): boolean;

  /** text slot prop 이름 생성 */
  generateTextPropName(nodeName: string): string;

  /** text slot의 기본값 추출 */
  getDefaultTextValue(mergedNodeIds: string[], data: PreparedDesignData): string;

  /** TEXT 노드를 text slot으로 변환 */
  detectTextSlot(
    input: TextSlotInput,
    totalVariantCount: number,
    data: PreparedDesignData
  ): TextSlotResult;
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
// ExternalRefBuilder Interface
// ============================================================================

export interface ExternalRefInput {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  nodeSpec: SceneNode | undefined;
}

export interface ExternalRefResult {
  componentSetId: string;
  componentName: string;
  props: Record<string, string>;
}

export interface IExternalRefBuilder {
  /** 외부 컴포넌트 참조 정보 생성 */
  buildExternalRef(
    input: ExternalRefInput,
    data: PreparedDesignData
  ): ExternalRefResult | undefined;
}

// ============================================================================
// PropsExtractor Interface
// ============================================================================

export interface IPropsExtractor {
  /** componentPropertyDefinitions에서 props 추출 */
  extractProps(props: unknown): Map<string, PropDefinition>;

  /** prop 타입 매핑 (VARIANT → variant, BOOLEAN → boolean 등) */
  mapPropType(type?: string): PropDefinition["type"];
}

