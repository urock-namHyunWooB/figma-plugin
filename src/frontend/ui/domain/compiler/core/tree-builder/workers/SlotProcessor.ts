/**
 * Slot Processor
 *
 * Slot 감지 및 처리를 담당하는 통합 Processor
 *
 * 포함된 기능:
 * - SlotDetector: INSTANCE/INSTANCE_SWAP slot 감지
 * - TextSlotDetector: TEXT → text slot 변환
 */

import type { SlotDefinition, ArraySlotInfo, PropDefinition, PreparedDesignData } from "@compiler/types/architecture";
import type { ISlotDetector, ITextSlotDetector, SlotCandidate, TextSlotInput, TextSlotResult, BuildContext } from "./interfaces";
import { toCamelCase } from "./utils/stringUtils";
import { getComponentId } from "./utils/typeGuards";
import { traverseTree } from "./utils/treeUtils";
import { NodeProcessor } from "./NodeProcessor";

// ============================================================================
// SlotProcessor Class
// ============================================================================

export class SlotProcessor implements ISlotDetector, ITextSlotDetector {
  // ==========================================================================
  // Static Pipeline Methods
  // ==========================================================================

  static detectTextSlots(ctx: BuildContext): BuildContext {
    if (!ctx.internalTree || !ctx.propsMap || !ctx.nodePropBindings) {
      throw new Error("SlotProcessor.detectTextSlots: internalTree, propsMap, and nodePropBindings are required.");
    }

    const instance = new SlotProcessor();
    const propsMap = new Map(ctx.propsMap);
    const nodePropBindings = new Map(ctx.nodePropBindings);

    traverseTree(ctx.internalTree, (node) => {
      const result = instance.detectTextSlot(
        {
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          mergedNodeIds: node.mergedNode.map((m) => m.id),
        },
        ctx.totalVariantCount,
        ctx.data
      );

      if (result.shouldConvert && result.propName && result.propDefinition) {
        if (!propsMap.has(result.propName)) {
          propsMap.set(result.propName, result.propDefinition);
        }
        const existing = nodePropBindings.get(node.id) || {};
        nodePropBindings.set(node.id, { ...existing, characters: result.propName });
      }
    });

    return { ...ctx, propsMap, nodePropBindings };
  }

  static detectSlots(ctx: BuildContext): BuildContext {
    if (!ctx.internalTree) {
      throw new Error("SlotProcessor.detectSlots: internalTree is required.");
    }

    const instance = new SlotProcessor();
    const slots: SlotDefinition[] = [...ctx.slots];
    const propsDefinitions = ctx.data.props as unknown as Record<string, { type: string }>;

    traverseTree(ctx.internalTree, (node) => {
      if (NodeProcessor.isComponentReference(node.type)) {
        const nodeSpec = ctx.data.getNodeById(node.id);
        const candidates = instance.findSlotCandidates(
          [{
            id: node.id,
            name: node.name,
            type: node.type,
            componentPropertyReferences: nodeSpec?.componentPropertyReferences as Record<string, string> | undefined,
          }],
          propsDefinitions
        );
        for (const c of candidates) {
          if (c.propName) {
            slots.push(instance.extractSlotDefinition(c.nodeId, c.nodeName, c.propName));
          }
        }
      }
    });

    return { ...ctx, slots };
  }

  static detectArraySlots(ctx: BuildContext): BuildContext {
    if (!ctx.internalTree) {
      throw new Error("SlotProcessor.detectArraySlots: internalTree is required.");
    }

    const instance = new SlotProcessor();
    const arraySlots: ArraySlotInfo[] = [...ctx.arraySlots];

    traverseTree(ctx.internalTree, (node) => {
      if (node.children.length >= 2) {
        const childrenInfo = node.children.map((child) => ({
          id: child.id,
          name: child.name,
          type: child.type,
          componentId: getComponentId(ctx.data.getNodeById(child.id)),
        }));
        const arraySlot = instance.detectArraySlot(childrenInfo);
        if (arraySlot) arraySlots.push(arraySlot);
      }
    });

    return { ...ctx, arraySlots };
  }

  // ==========================================================================
  // SlotDetector Methods
  // ==========================================================================

  /**
   * INSTANCE 노드가 slot으로 변환될 조건 확인
   */
  public shouldConvertToSlot(
    nodeType: string,
    visibleRef?: string,
    propType?: string
  ): boolean {
    if (nodeType === "INSTANCE" && visibleRef && propType === "BOOLEAN") {
      return true;
    }
    if (propType === "INSTANCE_SWAP") {
      return true;
    }
    return false;
  }

  /**
   * 노드에서 slot 정보 추출
   */
  public extractSlotDefinition(
    nodeId: string,
    nodeName: string,
    propName: string
  ): SlotDefinition {
    const slotName = this.normalizeSlotName(propName, nodeName);
    return {
      name: slotName,
      targetNodeId: nodeId,
    };
  }

  /**
   * 배열 슬롯 감지
   */
  public detectArraySlot(
    children: Array<{ id: string; name: string; type: string; componentId?: string }>
  ): ArraySlotInfo | null {
    const instances = children.filter((c) => c.type === "INSTANCE");
    if (instances.length < 2) return null;

    const byComponentId = new Map<string, typeof instances>();

    for (const inst of instances) {
      if (!inst.componentId) continue;
      const key = inst.componentId;
      if (!byComponentId.has(key)) {
        byComponentId.set(key, []);
      }
      byComponentId.get(key)!.push(inst);
    }

    for (const [componentId, group] of byComponentId.entries()) {
      if (group.length >= 2) {
        const baseName = toCamelCase(group[0].name);
        const slotName = baseName.endsWith("s") ? baseName : `${baseName}s`;

        return {
          name: slotName,
          nodeIds: group.map((g) => g.id),
          itemType: componentId,
          minItems: 1,
          maxItems: undefined,
        };
      }
    }

    return null;
  }

  /**
   * 모든 slot 후보 찾기
   */
  public findSlotCandidates(
    nodes: Array<{
      id: string;
      name: string;
      type: string;
      componentPropertyReferences?: Record<string, string>;
    }>,
    propsDefinitions: Record<string, { type: string }>
  ): SlotCandidate[] {
    const candidates: SlotCandidate[] = [];

    for (const node of nodes) {
      const visibleRef = node.componentPropertyReferences?.visible;

      if (visibleRef && node.type === "INSTANCE") {
        const propDef = propsDefinitions[visibleRef];
        if (propDef?.type === "BOOLEAN") {
          candidates.push({
            nodeId: node.id,
            nodeName: node.name,
            nodeType: node.type,
            propName: visibleRef,
            propType: "boolean",
          });
        }
      }

      const mainComponentRef = node.componentPropertyReferences?.mainComponent;
      if (mainComponentRef) {
        const propDef = propsDefinitions[mainComponentRef];
        if (propDef?.type === "INSTANCE_SWAP") {
          candidates.push({
            nodeId: node.id,
            nodeName: node.name,
            nodeType: node.type,
            propName: mainComponentRef,
            propType: "instance_swap",
          });
        }
      }
    }

    return candidates;
  }

  // ==========================================================================
  // TextSlotDetector Methods
  // ==========================================================================

  /**
   * TEXT 노드가 slot이 되어야 하는지 분석
   * variant간 characters가 다르면 slot으로 변환
   */
  public shouldBeTextSlot(
    mergedNodeIds: string[],
    totalVariantCount: number,
    data: PreparedDesignData
  ): boolean {
    // TEXT가 일부 variant에만 존재하는 경우
    if (totalVariantCount > 0 && mergedNodeIds.length < totalVariantCount) {
      return true;
    }

    // 병합된 노드가 2개 이상인 경우: 각 variant의 characters 비교
    if (mergedNodeIds.length > 1) {
      let firstCharacters: string | undefined;
      let allSame = true;

      for (const nodeId of mergedNodeIds) {
        const textSpec = data.getNodeById(nodeId);
        const characters = textSpec && "characters" in textSpec
          ? (textSpec as { characters: string }).characters
          : undefined;

        if (firstCharacters === undefined) {
          firstCharacters = characters;
        } else if (characters !== firstCharacters) {
          allSame = false;
          break;
        }
      }

      if (!allSame) {
        return true;
      }
    }

    return false;
  }

  /**
   * TEXT 노드가 text slot으로 변환되어야 하는지 확인
   */
  public shouldConvertToTextSlot(
    mergedNodeIds: string[],
    totalVariantCount: number,
    data: PreparedDesignData
  ): boolean {
    return this.shouldBeTextSlot(mergedNodeIds, totalVariantCount, data);
  }

  /**
   * text slot prop 이름 생성
   */
  public generateTextPropName(nodeName: string): string {
    const baseName = toCamelCase(nodeName);
    return baseName.toLowerCase().endsWith("text") ? baseName : baseName + "Text";
  }

  /**
   * text slot의 기본값 추출
   */
  public getDefaultTextValue(mergedNodeIds: string[], data: PreparedDesignData): string {
    if (mergedNodeIds.length === 0) return "";
    const textSpec = data.getNodeById(mergedNodeIds[0]);
    if (textSpec && "characters" in textSpec) {
      return (textSpec as { characters: string }).characters;
    }
    return "";
  }

  /**
   * TEXT 노드를 text slot으로 변환
   */
  public detectTextSlot(
    input: TextSlotInput,
    totalVariantCount: number,
    data: PreparedDesignData
  ): TextSlotResult {
    if (input.nodeType !== "TEXT") {
      return { shouldConvert: false };
    }

    if (!this.shouldConvertToTextSlot(input.mergedNodeIds, totalVariantCount, data)) {
      return { shouldConvert: false };
    }

    const propName = this.generateTextPropName(input.nodeName);

    const propDefinition: PropDefinition = {
      name: propName,
      type: "string",
      defaultValue: this.getDefaultTextValue(input.mergedNodeIds, data),
      required: false,
    };

    return {
      shouldConvert: true,
      propName,
      propDefinition,
    };
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * slot 이름 정규화
   */
  private normalizeSlotName(propName: string, nodeName: string): string {
    if (!propName) return toCamelCase(nodeName);

    const normalized = propName
      .replace(/^show/i, "")
      .replace(/^has/i, "");

    return normalized.charAt(0).toLowerCase() + normalized.slice(1);
  }
}

export default SlotProcessor;
