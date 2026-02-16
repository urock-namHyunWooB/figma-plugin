/**
 * Visibility Processor
 *
 * Visibility 관련 처리를 담당하는 통합 Processor
 *
 * 포함된 기능:
 * - ConditionParser: variant 이름에서 조건 파싱
 * - VisibilityDetector: visibility 조건 추론
 * - VisibilityResolver: visibility 결과 결정
 * - HiddenNodeProcessor: hidden 노드 처리
 */

import type { PropDefinition, ConditionalRule, PreparedDesignData } from "@code-generator/types/architecture";
import type { ConditionNode, VisibleValue } from "@code-generator/types/customType";
import type {
  IVisibilityDetector,
  IVisibilityResolver,
  IHiddenNodeProcessor,
  MergedNodeWithVariant,
  VisibilityInput,
  VisibilityResult,
  HiddenProcessableNode,
  HiddenNodeResult,
  BuildContext,
} from "./interfaces";
import type { InternalNode } from "./VariantProcessor";
import { toCamelCase } from "./utils/stringUtils";
import { traverseTree } from "./utils/treeUtils";
import { stateToPseudo, isCssConvertibleState } from "./utils/stateUtils";

// ============================================================================
// Types
// ============================================================================

export interface VisibleState {
  type: "static" | "condition" | "propBinding";
  value?: boolean;
  condition?: ConditionNode;
  propName?: string;
}

export interface IConditionParser {
  parseVariantCondition(variantName: string): ConditionNode | null;
  createPropCondition(propName: string): ConditionNode;
  extractPropNameFromRef(visibleRef: string, propsMap: Map<string, PropDefinition>): string | null;
}

// ============================================================================
// VisibilityProcessor Class
// ============================================================================

export class VisibilityProcessor
  implements IVisibilityDetector, IVisibilityResolver, IHiddenNodeProcessor, IConditionParser
{
  private usedPropNames: Set<string> = new Set();

  // ==========================================================================
  // Static Utility Method
  // ==========================================================================

  static parseVariantCondition(variantName: string): ConditionNode | null {
    const instance = new VisibilityProcessor();
    return instance.parseVariantCondition(variantName);
  }

  /**
   * variant 조건 파싱 (특정 prop 제외)
   * 휴리스틱으로 제거된 prop (guideText 등)을 조건에서 제외
   */
  static parseVariantConditionExcluding(
    variantName: string,
    excludeProps: Set<string>
  ): ConditionNode | null {
    const instance = new VisibilityProcessor();
    return instance.parseVariantConditionExcluding(variantName, excludeProps);
  }

  // ==========================================================================
  // Static Pipeline Method
  // ==========================================================================

  /**
   * hidden 노드 처리 및 show* prop 생성
   *
   * visible=false인 노드들을 찾아 show* prop을 생성합니다.
   * 이를 통해 기본적으로 숨겨진 요소를 인스턴스에서 보이게 할 수 있습니다.
   *
   * 처리 내용:
   * - 모든 variant에서 항상 숨겨진 노드는 제외 (렌더링 안 함)
   * - 일부 variant에서만 숨겨진 노드는 show* prop 생성
   * - prop condition을 hiddenConditions Map에 저장
   *
   * @returns propsMap과 hiddenConditions가 업데이트된 BuildContext
   */
  static processHidden(ctx: BuildContext): BuildContext {
    if (!ctx.internalTree) {
      throw new Error("VisibilityProcessor.processHidden: internalTree is required.");
    }
    if (!ctx.propsMap) {
      throw new Error("VisibilityProcessor.processHidden: propsMap is required.");
    }

    const instance = new VisibilityProcessor();
    const dataClass = ctx.data;
    const totalVariantCount = ctx.totalVariantCount || 1;

    // hidden 노드 수집 (모든 variant에서 항상 숨겨진 노드는 제외)
    const hiddenNodes: HiddenProcessableNode[] = [];

    traverseTree(ctx.internalTree, (n) => {
      const spec = dataClass.getNodeById(n.id);
      const pn: HiddenProcessableNode = {
        id: n.id,
        name: n.name,
        componentPropertyReferences: spec?.componentPropertyReferences as
          | Record<string, string>
          | undefined,
      };

      // hidden 노드인지 확인
      if (!instance.isHiddenNode(pn, dataClass)) {
        return;
      }

      // show* prop 생성 필요 여부 확인
      // (shouldCreateShowProp이 "항상 숨겨진 노드" 체크를 포함)
      const mergedNodes = n.mergedNode || [];
      if (instance.shouldCreateShowProp(mergedNodes, totalVariantCount, dataClass)) {
        hiddenNodes.push(pn);
      }
    });

    const { results, newProps } = instance.processAllHiddenNodes(hiddenNodes);

    // 새로운 props 추가
    const propsMap = new Map(ctx.propsMap);
    for (const prop of newProps) {
      propsMap.set(prop.name, prop);
    }

    // 조건 맵 생성
    const hiddenConditions = new Map<string, ConditionNode>();
    for (const r of results) {
      hiddenConditions.set(r.nodeId, r.condition);
    }

    return { ...ctx, propsMap, hiddenConditions };
  }

  /**
   * visibility 조건을 최종 결정하여 conditionalRule 생성
   *
   * 각 노드의 visibility 상태를 분석하여 조건부 렌더링 규칙을 생성합니다.
   *
   * 분석 순서:
   * 1. hiddenCondition이 있으면 사용 (processHidden에서 설정)
   * 2. visible prop 바인딩이 있으면 prop 조건 생성
   * 3. Type별 visibility 차이 분석 (icon-* 타입 등)
   * 4. variant 기반 visibility 추론
   *
   * 결과로 node.conditions와 ctx.conditionals에 조건 추가
   *
   * @returns conditionals가 업데이트된 BuildContext
   */
  static resolve(ctx: BuildContext): BuildContext {
    if (!ctx.internalTree || !ctx.propsMap || !ctx.hiddenConditions) {
      throw new Error("VisibilityProcessor.resolve: internalTree, propsMap, and hiddenConditions are required.");
    }

    const instance = new VisibilityProcessor();
    const conditionals = [...ctx.conditionals];

    traverseTree(ctx.internalTree, (node) => {
      const nodeSpec = ctx.data.getNodeById(node.id);
      // Type별 visibility 차이 분석
      const typeBasedCondition = instance.analyzeTypeBasedVisibility(
        node.mergedNode || [],
        ctx.totalVariantCount,
        ctx.data
      );

      const result = instance.resolveVisibility(
        {
          nodeId: node.id,
          mergedNodes: node.mergedNode || [],
          visibleRef: nodeSpec?.componentPropertyReferences?.visible,
          hiddenCondition: ctx.hiddenConditions!.get(node.id) || typeBasedCondition,
        },
        ctx.totalVariantCount,
        ctx.propsMap!,
        // visibility용으로 State 조건만 파싱 (Type은 별도 분석)
        instance.parseStateConditionOnly.bind(instance)
      );
      if (result.conditionalRule) {
        conditionals.push(result.conditionalRule);
        // 노드에 직접 조건 설정
        if (!node.conditions) {
          node.conditions = [];
        }
        node.conditions.push(result.conditionalRule);
      }
    });

    return { ...ctx, conditionals };
  }

  // ==========================================================================
  // ConditionParser Methods
  // ==========================================================================

  /**
   * variant 이름에서 모든 조건 파싱 (스타일 동적 적용용)
   * Size, Left Icon 등 모든 prop 조건 포함
   */
  public parseVariantCondition(variantName: string): ConditionNode | null {
    return this.parseVariantConditionExcluding(variantName, new Set());
  }

  /**
   * variant 이름에서 조건 파싱 (특정 prop 제외)
   * excludeProps에 포함된 prop은 조건에서 제외
   */
  public parseVariantConditionExcluding(
    variantName: string,
    excludeProps: Set<string>
  ): ConditionNode | null {
    if (!variantName) return null;

    const conditions: ConditionNode[] = [];

    for (const pair of variantName.split(",").map((s) => s.trim())) {
      const [key, value] = pair.split("=").map((s) => s.trim());
      if (!key || !value) continue;
      // pseudo-class가 있는 State만 무시 (hover → :hover, active → :active 등)
      // default state (Normal, Default 등)는 조건으로 파싱 (null이므로 조건 생성됨)
      if (key.toLowerCase() === "state") {
        const pseudoClass = stateToPseudo(value);
        if (pseudoClass) continue; // pseudo-class 있으면 제외 (null/undefined는 포함)
      }

      const propName = toCamelCase(key);
      // 제외할 prop은 건너뛰기
      if (excludeProps.has(propName)) continue;

      // Keep original case for value (e.g., "Large", "Medium") to match prop values
      conditions.push(this.createBinaryCondition(propName, value));
    }

    return this.combineConditionsWithAnd(conditions);
  }

  /**
   * variant 이름에서 State 조건만 파싱 (visibility용)
   * CSS 변환 불가능한 State만 조건으로 반환 (Error, Insert 등)
   * Size, Left Icon 등 다른 prop은 무시
   */
  public parseStateConditionOnly(variantName: string): ConditionNode | null {
    if (!variantName) return null;

    for (const pair of variantName.split(",").map((s) => s.trim())) {
      const [key, value] = pair.split("=").map((s) => s.trim());
      if (!key || !value) continue;
      const keyLower = key.toLowerCase();
      // State 또는 States만 처리
      if (keyLower !== "state" && keyLower !== "states") continue;
      // CSS 변환 가능한 State는 무시
      if (isCssConvertibleState(value)) continue;
      // CSS 변환 불가능한 State만 조건으로 반환
      return this.createBinaryCondition(toCamelCase(key), value);
    }

    return null;
  }

  /**
   * Type 기반 visibility 분석
   * 특정 Type(예: icon-*)에서만 노드가 없으면 해당 조건 생성
   */
  public analyzeTypeBasedVisibility(
    mergedNodes: MergedNodeWithVariant[],
    totalVariantCount: number,
    data: PreparedDesignData
  ): ConditionNode | null {
    // 모든 variant에 존재하면 조건 불필요
    if (mergedNodes.length >= totalVariantCount) return null;
    // 아무 variant에도 없으면 다른 로직에서 처리
    if (mergedNodes.length === 0) return null;

    // variant에서 Type 값 추출
    const presentTypes = new Set<string>();
    for (const node of mergedNodes) {
      const type = this.extractTypeFromVariantName(node.variantName);
      if (type) presentTypes.add(type);
    }

    // Type 값이 없으면 (Type prop이 없는 컴포넌트) 조건 불필요
    if (presentTypes.size === 0) return null;

    // 모든 가능한 Type 값 수집 (COMPONENT_SET의 componentPropertyDefinitions에서)
    const allTypes = this.getAllTypeValues(data);
    if (allTypes.size === 0) return null;

    // 노드가 없는 Type들
    const absentTypes = new Set<string>();
    for (const type of allTypes) {
      if (!presentTypes.has(type)) {
        absentTypes.add(type);
      }
    }

    // 노드가 없는 Type이 없으면 조건 불필요
    if (absentTypes.size === 0) return null;

    // icon-* 패턴 분석: 모든 absent types가 icon-으로 시작하면 icon 패턴
    const allAbsentAreIcon = Array.from(absentTypes).every(t => t.startsWith("icon-") || t.startsWith("icon_"));

    if (allAbsentAreIcon && absentTypes.size > 0) {
      // icon-* 타입이 아닐 때만 보임
      // customType이 presentTypes 중 하나일 때 보임
      const conditions = Array.from(presentTypes).map(type =>
        this.createBinaryCondition("customType", type)
      );
      if (conditions.length > 0) {
        return this.combineConditionsWithOr(conditions);
      }
    }

    return null;
  }

  /**
   * variant 이름에서 Type 값 추출
   */
  private extractTypeFromVariantName(variantName: string): string | null {
    if (!variantName) return null;
    for (const pair of variantName.split(",").map(s => s.trim())) {
      const [key, value] = pair.split("=").map(s => s.trim());
      if (key?.toLowerCase() === "type" && value) {
        return value;
      }
    }
    return null;
  }

  /**
   * COMPONENT_SET에서 모든 Type 값 수집
   */
  private getAllTypeValues(data: PreparedDesignData): Set<string> {
    const types = new Set<string>();
    const propDefs = data.document.componentPropertyDefinitions;
    if (!propDefs) return types;

    // "type" 또는 "Type" prop 찾기
    for (const [key, def] of Object.entries(propDefs)) {
      if (key.toLowerCase() === "type" && def.type === "VARIANT" && def.variantOptions) {
        for (const option of def.variantOptions) {
          types.add(option);
        }
        break;
      }
    }

    return types;
  }

  public createPropCondition(propName: string): ConditionNode {
    return {
      type: "BinaryExpression",
      operator: "===",
      left: {
        type: "MemberExpression",
        object: { type: "Identifier", name: "props" },
        property: { type: "Identifier", name: propName },
        computed: false,
      },
      right: { type: "Literal", value: true },
    } as ConditionNode;
  }

  public extractPropNameFromRef(
    visibleRef: string,
    propsMap: Map<string, PropDefinition>
  ): string | null {
    // 1. originalKey로 매칭 (componentPropertyReferences의 visibleRef와 일치하는 prop 찾기)
    for (const [propName, propDef] of propsMap.entries()) {
      if (propDef.originalKey === visibleRef) return propDef.name;
    }
    // 2. 직접 key로 존재하면 해당 prop의 name 반환
    const directProp = propsMap.get(visibleRef);
    if (directProp) return directProp.name;
    // 3. fallback: ref에서 이름 추출하여 camelCase 변환
    const match = visibleRef.match(/^([^#]+)#/);
    if (match) return toCamelCase(match[1]);
    return null;
  }

  // ==========================================================================
  // VisibilityDetector Methods
  // ==========================================================================

  public inferVisibility(
    mergedNodes: MergedNodeWithVariant[],
    totalVariantCount: number,
    visibleRef?: string,
    parseCondition?: (variantName: string) => ConditionNode | null
  ): VisibleValue {
    if (visibleRef) {
      return { type: "static", value: true };
    }

    if (mergedNodes.length >= totalVariantCount) {
      return { type: "static", value: true };
    }

    if (mergedNodes.length === 0) {
      return { type: "static", value: false };
    }

    if (parseCondition) {
      const conditions: ConditionNode[] = [];
      for (const node of mergedNodes) {
        if (node.variantName) {
          const condition = parseCondition(node.variantName);
          if (condition) conditions.push(condition);
        }
      }

      if (conditions.length === 1) {
        return { type: "condition", condition: conditions[0] };
      }
      if (conditions.length > 1) {
        return { type: "condition", condition: this.combineConditionsWithOr(conditions) };
      }
    }

    return { type: "static", value: true };
  }

  public createConditionalRule(nodeId: string, condition: ConditionNode): ConditionalRule {
    return { condition, showNodeId: nodeId, fallback: "null" };
  }

  public analyzeVisibilityPattern(
    mergedNodes: MergedNodeWithVariant[],
    totalVariantCount: number
  ): "always" | "never" | "conditional" {
    if (mergedNodes.length === 0) return "never";
    if (mergedNodes.length >= totalVariantCount) return "always";
    return "conditional";
  }

  public isVisibleInVariant(mergedNodes: MergedNodeWithVariant[], variantName: string): boolean {
    return mergedNodes.some((node) => node.variantName === variantName);
  }

  // ==========================================================================
  // VisibilityResolver Methods
  // ==========================================================================

  public resolveVisibility(
    input: VisibilityInput,
    totalVariantCount: number,
    propsMap: Map<string, PropDefinition>,
    parseCondition: (variantName: string) => ConditionNode | null
  ): VisibilityResult {
    // 1. hiddenCondition이 있으면 사용
    if (input.hiddenCondition) {
      return {
        type: "conditional",
        conditionalRule: this.createConditionalRule(input.nodeId, input.hiddenCondition),
      };
    }

    // 2. visible prop 바인딩 확인
    if (input.visibleRef) {
      const propName = this.extractPropNameFromRef(input.visibleRef, propsMap);
      if (propName) {
        const condition = this.createPropCondition(propName);
        return {
          type: "conditional",
          conditionalRule: this.createConditionalRule(input.nodeId, condition),
          propBinding: propName,
        };
      }
    }

    // 3. variant 기반 visibility 추론
    const visible = this.inferVisibility(
      input.mergedNodes,
      totalVariantCount,
      input.visibleRef,
      parseCondition
    );

    if (visible.type === "condition" && visible.condition) {
      return {
        type: "conditional",
        conditionalRule: this.createConditionalRule(input.nodeId, visible.condition),
      };
    }

    return { type: "always" };
  }

  // ==========================================================================
  // HiddenNodeProcessor Methods
  // ==========================================================================

  public resetUsedPropNames(): void {
    this.usedPropNames.clear();
  }

  public generateShowPropName(nodeName: string): string {
    const basePropName = `show${this.capitalizeFirstLetter(toCamelCase(nodeName) || "Hidden")}`;
    let propName = basePropName;
    let counter = 1;
    while (this.usedPropNames.has(propName)) {
      propName = `${basePropName}${counter}`;
      counter++;
    }
    this.usedPropNames.add(propName);
    return propName;
  }

  public isHiddenNode(
    node: HiddenProcessableNode & { visible?: VisibleState },
    data: PreparedDesignData
  ): boolean {
    if (node.visible?.type === "static" && node.visible?.value === false) {
      return true;
    }
    const spec = data.getNodeById(node.id);
    if (
      spec &&
      spec.visible === false &&
      !node.componentPropertyReferences?.visible &&
      node.visible?.type !== "condition"
    ) {
      return true;
    }
    return false;
  }

  public processHiddenNode(
    node: HiddenProcessableNode,
    usedPropNames?: Set<string>
  ): HiddenNodeResult {
    // usedPropNames가 전달되면 사용, 아니면 내부 상태 사용
    if (usedPropNames) {
      const propName = this.generateShowPropNameWithSet(node.name, usedPropNames);
      const propDefinition: PropDefinition = {
        name: propName,
        type: "boolean",
        defaultValue: false,
        required: false,
      };
      const condition: ConditionNode = this.createPropCondition(propName);
      return { nodeId: node.id, propName, propDefinition, condition };
    }

    const propName = this.generateShowPropName(node.name);

    const propDefinition: PropDefinition = {
      name: propName,
      type: "boolean",
      defaultValue: false,
      required: false,
    };

    const condition: ConditionNode = this.createPropCondition(propName);

    return { nodeId: node.id, propName, propDefinition, condition };
  }

  /**
   * 외부 Set을 사용하여 showProp 이름 생성 (레거시 호환)
   */
  private generateShowPropNameWithSet(nodeName: string, usedPropNames: Set<string>): string {
    const basePropName = `show${this.capitalizeFirstLetter(toCamelCase(nodeName) || "Hidden")}`;
    let propName = basePropName;
    let counter = 1;
    while (usedPropNames.has(propName)) {
      propName = `${basePropName}${counter}`;
      counter++;
    }
    usedPropNames.add(propName);
    return propName;
  }

  /**
   * 배열에서 hidden 노드 찾기 (레거시 호환)
   */
  public findHiddenNodes(
    nodes: Array<HiddenProcessableNode & { visible?: VisibleState }>,
    data: PreparedDesignData
  ): HiddenProcessableNode[] {
    return nodes.filter((node) => this.isHiddenNode(node, data));
  }

  public processAllHiddenNodes(nodes: HiddenProcessableNode[]): {
    results: HiddenNodeResult[];
    newProps: PropDefinition[];
  } {
    this.resetUsedPropNames();
    const results: HiddenNodeResult[] = [];
    const newProps: PropDefinition[] = [];

    for (const node of nodes) {
      const result = this.processHiddenNode(node);
      if (result) {
        results.push(result);
        newProps.push(result.propDefinition);
      }
    }

    return { results, newProps };
  }

  public collectFromTree(root: InternalNode, data: PreparedDesignData): HiddenProcessableNode[] {
    const nodes: HiddenProcessableNode[] = [];

    traverseTree(root, (n) => {
      const spec = data.getNodeById(n.id);
      const pn: HiddenProcessableNode = {
        id: n.id,
        name: n.name,
        componentPropertyReferences: spec?.componentPropertyReferences as
          | Record<string, string>
          | undefined,
      };

      if (this.isHiddenNode(pn, data)) {
        nodes.push(pn);
      }
    });

    return nodes;
  }

  /**
   * show* prop 생성 여부 판별
   *
   * visible=false인 노드는 show* prop을 생성하여 인스턴스에서 override 가능하게 함.
   * 모든 variant에서 visible인 노드는 prop 생성 안 함.
   *
   * @param mergedNodes 노드의 variant별 존재 정보
   * @param totalVariantCount 전체 variant 수
   * @param data PreparedDesignData (visible 상태 확인용)
   * @returns true면 prop 생성, false면 생성 안 함
   */
  public shouldCreateShowProp(
    mergedNodes: MergedNodeWithVariant[],
    _totalVariantCount: number,
    data: PreparedDesignData
  ): boolean {
    // 노드가 없으면 prop 생성 안 함
    if (mergedNodes.length === 0) return false;

    // 하나라도 visible=false면 prop 생성 (hidden by default → can be shown)
    for (const merged of mergedNodes) {
      const spec = data.getNodeById(merged.id);
      if (spec?.visible === false) {
        return true;
      }
    }

    // 모든 variant에서 visible → prop 생성 안 함
    return false;
  }

  /**
   * 노드가 모든 variant에서 항상 숨겨져 있는지 확인
   */
  public isAlwaysHidden(
    mergedNodes: MergedNodeWithVariant[],
    totalVariantCount: number,
    data: PreparedDesignData
  ): boolean {
    // 모든 variant에 존재하는지 확인
    if (mergedNodes.length !== totalVariantCount) {
      return false;
    }

    // 모든 variant에서 visible=false인지 확인
    return mergedNodes.every(merged => {
      const spec = data.getNodeById(merged.id);
      return spec?.visible === false;
    });
  }

  /**
   * 노드 ID로 업데이트된 visible 상태 반환 (레거시 호환)
   */
  public getUpdatedVisibleState(
    nodeId: string,
    results: HiddenNodeResult[]
  ): VisibleState | null {
    const result = results.find((r) => r.nodeId === nodeId);
    if (!result) return null;
    return {
      type: "condition",
      condition: result.condition,
    };
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private createBinaryCondition(propName: string, value: string): ConditionNode {
    return {
      type: "BinaryExpression",
      operator: "===",
      left: {
        type: "MemberExpression",
        object: { type: "Identifier", name: "props" },
        property: { type: "Identifier", name: propName },
        computed: false,
      },
      right: { type: "Literal", value },
    } as ConditionNode;
  }

  private combineConditionsWithAnd(conditions: ConditionNode[]): ConditionNode | null {
    if (conditions.length === 0) return null;
    if (conditions.length === 1) return conditions[0];
    return conditions.reduce(
      (acc, cond) => ({ type: "LogicalExpression", operator: "&&", left: acc, right: cond }) as ConditionNode
    );
  }

  private combineConditionsWithOr(conditions: ConditionNode[]): ConditionNode {
    if (conditions.length === 1) return conditions[0];
    return conditions.reduce(
      (acc, cond) => ({ type: "LogicalExpression", operator: "||", left: acc, right: cond }) as ConditionNode
    );
  }

  private capitalizeFirstLetter(str: string): string {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

export default VisibilityProcessor;
