/**
 * Slot Processor
 *
 * Slot 감지 및 처리를 담당하는 통합 Processor
 *
 * 포함된 기능:
 * - SlotDetector: INSTANCE/INSTANCE_SWAP slot 감지
 * - TextSlotDetector: TEXT → text slot 변환
 */

import type {
  SlotDefinition,
  ArraySlotInfo,
  PropDefinition,
  PreparedDesignData,
} from "@compiler/types/architecture";
import type {
  ISlotDetector,
  ITextSlotDetector,
  SlotCandidate,
  TextSlotInput,
  TextSlotResult,
  BuildContext,
} from "./interfaces";
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
      throw new Error(
        "SlotProcessor.detectTextSlots: internalTree, propsMap, and nodePropBindings are required."
      );
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
        nodePropBindings.set(node.id, {
          ...existing,
          characters: result.propName,
        });
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
    const propsMap = ctx.propsMap ? new Map(ctx.propsMap) : new Map();
    const propsDefinitions = ctx.data.props as unknown as Record<
      string,
      { type: string }
    >;

    // Find boolean-like props (VARIANT with True/False options)
    // These are candidates for visibility-pattern slots (if they control INSTANCE visibility)
    const booleanLikeProps: Array<{ name: string; originalKey: string }> = [];
    for (const [key, prop] of propsMap.entries()) {
      // Access options with type assertion since PropsProcessor sets it
      const propAny = prop as PropDefinition & { options?: string[] };
      // Look for boolean type (converted from True/False VARIANT) with preserved options
      if (
        prop.type === "boolean" &&
        propAny.options &&
        propAny.options.length === 2
      ) {
        const hasTrue = propAny.options.some(
          (o: string) => o === "True" || o === "true"
        );
        const hasFalse = propAny.options.some(
          (o: string) => o === "False" || o === "false"
        );
        if (hasTrue && hasFalse) {
          booleanLikeProps.push({
            name: prop.name,
            originalKey: prop.originalKey || key,
          });
        }
      }
    }

    traverseTree(ctx.internalTree, (node) => {
      if (NodeProcessor.isComponentReference(node.type)) {
        const nodeSpec = ctx.data.getNodeById(node.id);
        const candidates = instance.findSlotCandidates(
          [
            {
              id: node.id,
              name: node.name,
              type: node.type,
              componentPropertyReferences:
                nodeSpec?.componentPropertyReferences as
                  | Record<string, string>
                  | undefined,
              isExposedInstance: (
                nodeSpec as { isExposedInstance?: boolean } | undefined
              )?.isExposedInstance,
            },
          ],
          propsDefinitions
        );
        for (const c of candidates) {
          if (c.propName) {
            slots.push(
              instance.extractSlotDefinition(c.nodeId, c.nodeName, c.propName)
            );

            // Update prop type to "slot" for visibility-controlled INSTANCE props
            if (c.propType === "boolean" && propsMap.has(c.propName)) {
              const existingProp = propsMap.get(c.propName)!;
              propsMap.set(c.propName, { ...existingProp, type: "slot" });
            }

            // Add prop for exposed instance slots
            if (c.propType === "exposed_instance") {
              const slotName = toCamelCase(c.nodeName);
              propsMap.set(slotName, {
                name: slotName,
                type: "slot",
                defaultValue: null,
                required: false,
              });
            }
          }
        }

        // Detect nodes controlled by boolean-like props (visibility-pattern)
        // These are nodes that only exist in "True" variants of the prop
        if (
          node.mergedNode &&
          node.mergedNode.length > 0 &&
          booleanLikeProps.length > 0
        ) {
          for (const blProp of booleanLikeProps) {
            // Case-insensitive pattern matching (True/true, False/false)
            const truePatterns = [
              `${blProp.originalKey}=True`,
              `${blProp.originalKey}=true`,
            ];
            const falsePatterns = [
              `${blProp.originalKey}=False`,
              `${blProp.originalKey}=false`,
            ];

            const hasTrue = node.mergedNode.some((m) =>
              truePatterns.some((p) => m.variantName?.includes(p))
            );
            const hasFalse = node.mergedNode.some((m) =>
              falsePatterns.some((p) => m.variantName?.includes(p))
            );

            // Node only exists in True variants → controlled by this visibility prop
            // Upgrade the prop from boolean to slot
            if (hasTrue && !hasFalse) {
              // Check if slot already exists for this node
              if (!slots.some((s) => s.targetNodeId === node.id)) {
                slots.push({
                  name: blProp.name,
                  targetNodeId: node.id,
                });

                // Upgrade the prop type from boolean to slot
                const propKey = [...propsMap.entries()].find(
                  ([_, p]) => p.name === blProp.name
                )?.[0];
                if (propKey && propsMap.has(propKey)) {
                  const existingProp = propsMap.get(propKey)!;
                  propsMap.set(propKey, {
                    ...existingProp,
                    type: "slot",
                    defaultValue: null,
                  });
                }
              }
            }
          }
        }
      }
    });

    return { ...ctx, slots, propsMap };
  }

  static detectArraySlots(ctx: BuildContext): BuildContext {
    if (!ctx.internalTree) {
      throw new Error(
        "SlotProcessor.detectArraySlots: internalTree is required."
      );
    }

    const instance = new SlotProcessor();
    const arraySlots: ArraySlotInfo[] = [...ctx.arraySlots];

    // 이미 개별 slot으로 감지된 노드 ID 수집
    const slotNodeIds = new Set(ctx.slots.map((s) => s.targetNodeId));

    traverseTree(ctx.internalTree, (node) => {
      // 개별 slot으로 감지된 노드는 제외하고 배열 슬롯 감지
      const nonSlotChildren = node.children.filter(
        (child) => !slotNodeIds.has(child.id)
      );

      if (nonSlotChildren.length >= 2) {
        const childrenInfo = nonSlotChildren.map((child) => ({
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

  /**
   * Array slot에 컴포넌트 이름과 itemProps 추가
   * nodeExternalRefs에서 첫 번째 노드의 componentName과 props를 가져옴
   */
  static enrichArraySlotsWithComponentNames(ctx: BuildContext): BuildContext {
    if (!ctx.arraySlots || !ctx.nodeExternalRefs) {
      return ctx;
    }

    const enrichedArraySlots = ctx.arraySlots.map((slot) => {
      // 첫 번째 노드 ID에서 컴포넌트 정보 가져오기
      if (slot.nodeIds.length > 0) {
        const firstNodeId = slot.nodeIds[0];
        const externalRef = ctx.nodeExternalRefs!.get(firstNodeId);
        if (externalRef?.componentName) {
          // dependencies에서 컴포넌트 props 추출
          const itemProps = SlotProcessor.extractItemPropsFromDependencies(
            externalRef.componentSetId,
            ctx.data.dependencies
          );

          return {
            ...slot,
            itemComponentName: externalRef.componentName,
            itemProps,
          };
        }
      }
      return slot;
    });

    return { ...ctx, arraySlots: enrichedArraySlots };
  }

  /**
   * 의존성 컴포넌트에서 itemProps 추출
   */
  private static extractItemPropsFromDependencies(
    componentSetId: string,
    dependencies: Map<string, unknown>
  ): Array<{ name: string; type: string; values?: string[] }> {
    const itemProps: Array<{ name: string; type: string; values?: string[] }> =
      [];

    // dependencies에서 componentSetId에 해당하는 컴포넌트 찾기
    for (const [_id, data] of dependencies.entries()) {
      const depData = data as {
        id?: string;
        componentPropertyDefinitions?: Record<string, unknown>;
      };

      // componentSetId로 매칭되는 의존성 찾기
      if (
        depData.id === componentSetId &&
        depData.componentPropertyDefinitions
      ) {
        for (const [name, def] of Object.entries(
          depData.componentPropertyDefinitions
        )) {
          const propDef = def as { type?: string; variantOptions?: string[] };
          if (propDef.type) {
            // prop 이름에서 # 이후 부분 제거하고 camelCase로 변환
            const cleanName = toCamelCase(name.split("#")[0]);
            itemProps.push({
              name: cleanName,
              type: propDef.type.toLowerCase(),
              values: propDef.variantOptions,
            });
          }
        }
        break;
      }
    }

    // 기본 props도 추가 (text는 일반적인 prop)
    if (itemProps.length === 0) {
      // 의존성에서 찾지 못한 경우 기본 props 사용
      itemProps.push({ name: "size", type: "variant" });
      itemProps.push({ name: "text", type: "string" });
    }

    return itemProps;
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
    children: Array<{
      id: string;
      name: string;
      type: string;
      componentId?: string;
    }>
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
        // Extract base name by removing trailing numbers and normalizing
        // "Option 1", "Option 2" → "option"
        // "Item-1", "Item-2" → "item"
        const firstName = group[0].name;
        const baseNameWithoutNumber = firstName.replace(/[\s_-]*\d+$/, "");
        const baseName = toCamelCase(baseNameWithoutNumber);
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
      isExposedInstance?: boolean;
    }>,
    propsDefinitions: Record<string, { type: string }>
  ): SlotCandidate[] {
    const candidates: SlotCandidate[] = [];

    for (const node of nodes) {
      // isExposedInstance: true → 항상 slot으로 처리 (Figma에서 명시적으로 노출된 인스턴스)
      if (node.isExposedInstance && node.type === "INSTANCE") {
        candidates.push({
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          propName: node.name,
          propType: "exposed_instance",
        });
        continue;
      }

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
        const characters =
          textSpec && "characters" in textSpec
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
    return baseName.toLowerCase().endsWith("text")
      ? baseName
      : baseName + "Text";
  }

  /**
   * text slot의 기본값 추출
   */
  public getDefaultTextValue(
    mergedNodeIds: string[],
    data: PreparedDesignData
  ): string {
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

    if (
      !this.shouldConvertToTextSlot(
        input.mergedNodeIds,
        totalVariantCount,
        data
      )
    ) {
      return { shouldConvert: false };
    }

    const propName = this.generateTextPropName(input.nodeName);

    // Extract default text content from the first variant
    const defaultTextContent = this.extractDefaultTextContent(
      input.nodeId,
      input.mergedNodeIds,
      data
    );

    const propDefinition: PropDefinition = {
      name: propName,
      type: "slot",
      defaultValue: defaultTextContent,
      required: false,
    };

    return {
      shouldConvert: true,
      propName,
      propDefinition,
    };
  }

  /**
   * Extract default text content from the first variant's TEXT node
   */
  private extractDefaultTextContent(
    nodeId: string,
    mergedNodeIds: string[],
    data: PreparedDesignData
  ): string | null {
    // Try to get text from the main node first
    const mainNode = data.getNodeById(nodeId);
    if (mainNode && typeof mainNode === "object" && "characters" in mainNode) {
      const characters = (mainNode as { characters?: string }).characters;
      if (characters) return characters;
    }

    // Fallback: try merged nodes
    for (const mergedId of mergedNodeIds) {
      const node = data.getNodeById(mergedId);
      if (node && typeof node === "object" && "characters" in node) {
        const characters = (node as { characters?: string }).characters;
        if (characters) return characters;
      }
    }

    return null;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * slot 이름 정규화
   */
  private normalizeSlotName(propName: string, nodeName: string): string {
    if (!propName) return toCamelCase(nodeName);

    // "showIcon" → "icon", "hasLabel" → "label"
    const normalized = propName.replace(/^show/i, "").replace(/^has/i, "");

    // 항상 camelCase로 변환 (공백, 특수문자 처리)
    return toCamelCase(normalized);
  }
}

export default SlotProcessor;
