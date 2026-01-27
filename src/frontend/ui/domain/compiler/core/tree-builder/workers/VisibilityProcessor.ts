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

import type { PropDefinition, ConditionalRule, PreparedDesignData } from "@compiler/types/architecture";
import type { ConditionNode, VisibleValue } from "@compiler/types/customType";
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

  // ==========================================================================
  // Static Pipeline Method
  // ==========================================================================

  static processHidden(ctx: BuildContext): BuildContext {
    if (!ctx.internalTree) {
      throw new Error("VisibilityProcessor.processHidden: internalTree is required.");
    }
    if (!ctx.propsMap) {
      throw new Error("VisibilityProcessor.processHidden: propsMap is required.");
    }

    const instance = new VisibilityProcessor();
    const dataClass = ctx.data;
    const hiddenNodes = instance.collectFromTree(ctx.internalTree, dataClass);
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

  static resolve(ctx: BuildContext): BuildContext {
    if (!ctx.internalTree || !ctx.propsMap || !ctx.hiddenConditions) {
      throw new Error("VisibilityProcessor.resolve: internalTree, propsMap, and hiddenConditions are required.");
    }

    const instance = new VisibilityProcessor();
    const conditionals = [...ctx.conditionals];

    const traverse = (node: InternalNode) => {
      const nodeSpec = (ctx.data).getNodeById(node.id);
      const result = instance.resolveVisibility(
        {
          nodeId: node.id,
          mergedNodes: node.mergedNode || [],
          visibleRef: nodeSpec?.componentPropertyReferences?.visible,
          hiddenCondition: ctx.hiddenConditions!.get(node.id),
        },
        ctx.totalVariantCount,
        ctx.propsMap!,
        instance.parseVariantCondition.bind(instance)
      );
      if (result.conditionalRule) {
        conditionals.push(result.conditionalRule);
      }
      for (const child of node.children) {
        traverse(child);
      }
    };
    traverse(ctx.internalTree);

    return { ...ctx, conditionals };
  }

  // ==========================================================================
  // ConditionParser Methods
  // ==========================================================================

  public parseVariantCondition(variantName: string): ConditionNode | null {
    if (!variantName) return null;

    const conditions: ConditionNode[] = [];

    for (const pair of variantName.split(",").map((s) => s.trim())) {
      const [key, value] = pair.split("=").map((s) => s.trim());
      if (!key || !value || key.toLowerCase() === "state") continue;
      conditions.push(this.createBinaryCondition(toCamelCase(key), value.toLowerCase()));
    }

    return this.combineConditionsWithAnd(conditions);
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
    for (const [propName, propDef] of propsMap.entries()) {
      if (propDef.originalKey === visibleRef) return propName;
    }
    if (propsMap.has(visibleRef)) return visibleRef;
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
    if ((node as any).visible?.type === "static" && (node as any).visible?.value === false) {
      return true;
    }
    const spec = data.getNodeById(node.id);
    if (
      spec &&
      (spec as any).visible === false &&
      !node.componentPropertyReferences?.visible &&
      (node as any).visible?.type !== "condition"
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

    const traverse = (n: InternalNode) => {
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

      n.children.forEach(traverse);
    };

    traverse(root);
    return nodes;
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
