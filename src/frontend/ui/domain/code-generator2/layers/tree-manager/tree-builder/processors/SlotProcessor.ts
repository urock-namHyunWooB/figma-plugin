/**
 * SlotProcessor (통합)
 *
 * v1 방식: 개별 slot과 배열 slot을 하나의 프로세서에서 처리
 *
 * 처리 순서:
 * 1. 개별 slot 감지 (visibility 제어 INSTANCE)
 * 2. 개별 slot props 업데이트 (boolean → slot)
 * 3. 배열 slot 감지 (개별 slot 제외)
 */

import type { InternalTree, ArraySlotInfo, PropDefinition } from "../../../types/types";
import type DataManager from "../../data-manager/DataManager";

export class SlotProcessor {
  constructor(private readonly dataManager: DataManager) {}

  /**
   * 통합 slot 처리
   *
   * @param tree - InternalTree
   * @param props - PropDefinition 배열
   * @returns { props: 업데이트된 props, arraySlots: 감지된 array slots }
   */
  public process(
    tree: InternalTree,
    props: PropDefinition[]
  ): { props: PropDefinition[]; arraySlots: ArraySlotInfo[] } {
    // Step 1: 개별 slot 감지 및 props 업데이트
    const updatedProps = this.detectAndConvertIndividualSlots(tree, props);

    // Step 2: 개별 slot으로 처리된 노드 ID 수집
    const individualSlotNodeIds = this.collectSlotNodeIds(tree);

    // Step 3: 배열 slot 감지 (개별 slot 제외)
    const arraySlots = this.detectArraySlots(tree, individualSlotNodeIds, updatedProps);

    return { props: updatedProps, arraySlots };
  }

  // ==========================================================================
  // 개별 Slot 감지 (InstanceSlotProcessor 로직)
  // ==========================================================================

  /**
   * 개별 slot 감지 및 props 업데이트
   */
  private detectAndConvertIndividualSlots(
    tree: InternalTree,
    props: PropDefinition[]
  ): PropDefinition[] {
    const propMap = new Map(props.map((p) => [p.sourceKey, p]));
    const slotInfo = new Map<string, { sourceKey: string; nodeIds: Set<string> }>();
    const nodeToSlotProp = new Map<string, string>();

    // 1. componentPropertyReferences.visible 방식
    this.collectVisibilityProps(tree, propMap, slotInfo, nodeToSlotProp);

    // 2. VARIANT True/False 패턴 방식
    this.collectVariantVisibilitySlots(tree, props, slotInfo, nodeToSlotProp);

    // 3. INSTANCE 노드에 bindings 설정
    this.applySlotBindings(tree, propMap, slotInfo, nodeToSlotProp);
    this.applyVariantSlotBindings(tree, props, slotInfo, nodeToSlotProp);

    // 4. boolean prop → slot으로 업그레이드
    return props.map((prop) => {
      if (slotInfo.has(prop.name)) {
        return {
          ...prop,
          type: "slot",
          defaultValue: null,
        };
      }
      return prop;
    });
  }

  private collectVisibilityProps(
    node: InternalTree,
    propMap: Map<string, PropDefinition>,
    slotInfo: Map<string, { sourceKey: string; nodeIds: Set<string> }>,
    nodeToSlotProp: Map<string, string>
  ): void {
    if (node.type === "INSTANCE" && node.componentPropertyReferences?.visible) {
      const visibleRef = node.componentPropertyReferences.visible;
      const sourceKey = visibleRef;
      const propDef = propMap.get(sourceKey);

      if (propDef && propDef.type === "boolean") {
        const existing = slotInfo.get(propDef.name);
        if (existing) {
          existing.nodeIds.add(node.id);
        } else {
          slotInfo.set(propDef.name, {
            sourceKey,
            nodeIds: new Set([node.id]),
          });
        }
        nodeToSlotProp.set(node.id, propDef.name);
      }
    }

    if (node.children) {
      for (const child of node.children) {
        this.collectVisibilityProps(child, propMap, slotInfo, nodeToSlotProp);
      }
    }
  }

  private collectVariantVisibilitySlots(
    root: InternalTree,
    props: PropDefinition[],
    slotInfo: Map<string, { sourceKey: string; nodeIds: Set<string> }>,
    nodeToSlotProp: Map<string, string>
  ): void {
    const slotPatternProps = props.filter(
      (p) =>
        p.type === "slot" &&
        this.isSlotPattern(p.name) &&
        !slotInfo.has(p.name)
    );

    if (slotPatternProps.length === 0) return;

    this.traverseAndCollectVariantSlots(root, slotPatternProps, slotInfo, nodeToSlotProp);
  }

  private traverseAndCollectVariantSlots(
    node: InternalTree,
    slotPatternProps: PropDefinition[],
    slotInfo: Map<string, { sourceKey: string; nodeIds: Set<string> }>,
    nodeToSlotProp: Map<string, string>
  ): void {
    if (node.type === "INSTANCE" && node.mergedNodes?.length) {
      for (const prop of slotPatternProps) {
        if (nodeToSlotProp.has(node.id)) continue;

        const propKey = prop.sourceKey.split("#")[0].trim();
        const truePatterns = [`${propKey}=True`, `${propKey}=true`];
        const falsePatterns = [`${propKey}=False`, `${propKey}=false`];

        const hasTrue = node.mergedNodes.some((m) =>
          truePatterns.some((p) => m.variantName?.includes(p))
        );
        const hasFalse = node.mergedNodes.some((m) =>
          falsePatterns.some((p) => m.variantName?.includes(p))
        );

        if (hasTrue && !hasFalse) {
          const existing = slotInfo.get(prop.name);
          if (existing) {
            existing.nodeIds.add(node.id);
          } else {
            slotInfo.set(prop.name, {
              sourceKey: prop.sourceKey,
              nodeIds: new Set([node.id]),
            });
          }
          nodeToSlotProp.set(node.id, prop.name);
          break;
        }
      }
    }

    if (node.children) {
      for (const child of node.children) {
        this.traverseAndCollectVariantSlots(child, slotPatternProps, slotInfo, nodeToSlotProp);
      }
    }
  }

  private applySlotBindings(
    node: InternalTree,
    propMap: Map<string, PropDefinition>,
    slotInfo: Map<string, { sourceKey: string; nodeIds: Set<string> }>,
    nodeToSlotProp: Map<string, string>
  ): void {
    if (node.type === "INSTANCE" && node.componentPropertyReferences?.visible) {
      const visibleRef = node.componentPropertyReferences.visible;
      const propDef = propMap.get(visibleRef);

      if (propDef && slotInfo.has(propDef.name)) {
        node.bindings = {
          ...node.bindings,
          content: { prop: propDef.name },
        };
      }
    }

    if (node.children) {
      for (const child of node.children) {
        this.applySlotBindings(child, propMap, slotInfo, nodeToSlotProp);
      }
    }
  }

  private applyVariantSlotBindings(
    node: InternalTree,
    props: PropDefinition[],
    slotInfo: Map<string, { sourceKey: string; nodeIds: Set<string> }>,
    nodeToSlotProp: Map<string, string>
  ): void {
    if (node.type === "INSTANCE" && !node.bindings?.content) {
      const propName = nodeToSlotProp.get(node.id);
      if (propName) {
        node.bindings = {
          ...node.bindings,
          content: { prop: propName },
        };
      }
    }

    if (node.children) {
      for (const child of node.children) {
        this.applyVariantSlotBindings(child, props, slotInfo, nodeToSlotProp);
      }
    }
  }

  private isSlotPattern(propName: string): boolean {
    const lowerName = propName.toLowerCase();
    return (
      lowerName.includes("icon") ||
      lowerName.includes("image") ||
      lowerName.includes("avatar") ||
      lowerName.includes("thumbnail") ||
      lowerName.includes("prefix") ||
      lowerName.includes("suffix")
    );
  }

  /**
   * 개별 slot으로 처리된 노드 ID 수집
   */
  private collectSlotNodeIds(tree: InternalTree): Set<string> {
    const slotNodeIds = new Set<string>();

    const traverse = (node: InternalTree) => {
      if (node.bindings?.content) {
        slotNodeIds.add(node.id);
      }
      if (node.children) {
        for (const child of node.children) {
          traverse(child);
        }
      }
    };

    traverse(tree);
    return slotNodeIds;
  }

  // ==========================================================================
  // 배열 Slot 감지 (v1 로직)
  // ==========================================================================

  /**
   * 배열 slot 감지 (v1 방식)
   */
  private detectArraySlots(
    tree: InternalTree,
    slotNodeIds: Set<string>,
    props: PropDefinition[]
  ): ArraySlotInfo[] {
    const arraySlots: ArraySlotInfo[] = [];
    const existingSlotNames = new Set(props.filter((p) => p.type === "slot").map((p) => p.name));

    this.traverseAndDetectArraySlots(tree, slotNodeIds, existingSlotNames, arraySlots);

    return arraySlots;
  }

  private traverseAndDetectArraySlots(
    node: InternalTree,
    slotNodeIds: Set<string>,
    existingSlotNames: Set<string>,
    result: ArraySlotInfo[]
  ): void {
    // SECTION 타입은 Array Slot 감지하지 않음
    if (node.type === "SECTION") {
      node.children.forEach((child) =>
        this.traverseAndDetectArraySlots(child, slotNodeIds, existingSlotNames, result)
      );
      return;
    }

    // 자식이 2개 미만이면 Array Slot 불가능
    if (node.children.length < 2) {
      node.children.forEach((child) =>
        this.traverseAndDetectArraySlots(child, slotNodeIds, existingSlotNames, result)
      );
      return;
    }

    // v1 방식: 이미 개별 slot인 노드 제외
    const nonSlotChildren = node.children.filter((child) => !slotNodeIds.has(child.id));

    if (nonSlotChildren.length >= 2) {
      const arraySlot = this.detectArraySlotFromChildren(
        node.id,
        nonSlotChildren,
        existingSlotNames
      );
      if (arraySlot) {
        result.push(arraySlot);
      }
    }

    // 재귀 처리
    node.children.forEach((child) =>
      this.traverseAndDetectArraySlots(child, slotNodeIds, existingSlotNames, result)
    );
  }

  /**
   * 자식 노드들에서 Array Slot 패턴 감지 (v1 방식)
   */
  private detectArraySlotFromChildren(
    parentId: string,
    children: InternalTree[],
    existingSlotNames: Set<string>
  ): ArraySlotInfo | null {
    // v1 방식: INSTANCE만 필터링
    const instances = children.filter((c) => c.type === "INSTANCE");

    if (instances.length < 2) {
      return null;
    }

    // v1 방식: componentId와 variantCount로 그룹화
    const byComponentIdAndCount = new Map<string, InternalTree[]>();

    for (const inst of instances) {
      const componentId = this.getComponentId(inst);
      if (!componentId) continue;

      // v1 로직: variantCount = mergedNodes?.length
      const variantCount = inst.mergedNodes?.length ?? 0;
      const key = `${componentId}:${variantCount}`;

      if (!byComponentIdAndCount.has(key)) {
        byComponentIdAndCount.set(key, []);
      }
      byComponentIdAndCount.get(key)!.push(inst);
    }

    // 2개 이상 그룹 찾기
    for (const [key, group] of byComponentIdAndCount.entries()) {
      if (group.length >= 2) {
        const slotName = this.generateSlotName(group[0].name);

        // 이미 slot props로 처리된 경우 제외
        if (existingSlotNames.has(slotName)) {
          continue;
        }

        return {
          parentId,
          nodeIds: group.map((node) => node.id),
          slotName,
        };
      }
    }

    return null;
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private getComponentId(node: InternalTree): string | undefined {
    if (node.type !== "INSTANCE") {
      return undefined;
    }

    const { node: figmaNode } = this.dataManager.getById(node.id);

    if (!figmaNode || !("componentId" in figmaNode)) {
      return undefined;
    }

    return (figmaNode as any).componentId;
  }

  private generateSlotName(firstName: string): string {
    // 숫자 제거 ("Option 1" → "Option", "Item-1" → "Item")
    const baseNameWithoutNumber = firstName.replace(/[\s_-]*\d+$/, "");

    // camelCase 변환
    const baseName = this.toCamelCase(baseNameWithoutNumber);

    // 복수형 변환 (이미 's'로 끝나면 그대로, 아니면 's' 추가)
    const slotName = baseName.endsWith("s") ? baseName : `${baseName}s`;

    return slotName;
  }

  private toCamelCase(str: string): string {
    return str
      .replace(/[^a-zA-Z0-9]+(.)/g, (_, char) => char.toUpperCase())
      .replace(/^[A-Z]/, (char) => char.toLowerCase());
  }
}
