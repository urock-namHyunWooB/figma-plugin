import type { InternalNode, PropDefinition } from "../../../../types/types";

/**
 * SlotBindingInfo
 *
 * prop과 INSTANCE 노드 ID의 매핑 정보
 */
interface SlotBindingInfo {
  sourceKey: string;
  nodeIds: Set<string>; // 이 prop과 연결된 INSTANCE 노드 ID들
}

/**
 * InstanceSlotProcessor
 *
 * visibility prop으로 제어되는 INSTANCE를 slot으로 변환
 *
 * 변환 조건:
 * 1. INSTANCE 노드에 componentPropertyReferences.visible 존재 (BOOLEAN 타입)
 * 2. VARIANT True/False 패턴으로 제어되는 INSTANCE (visibility-pattern)
 *
 * 변환 결과:
 * - prop 타입을 boolean → slot (React.ReactNode)으로 업그레이드
 * - INSTANCE는 slot으로 처리되어 사용자가 커스텀 콘텐츠 전달 가능
 */
export class InstanceSlotProcessor {
  /**
   * visibility 제어 INSTANCE를 slot으로 변환
   *
   * @param root - InternalNode 트리
   * @param props - PropDefinition 배열
   * @returns 업데이트된 props (boolean → slot으로 변환된)
   */
  public convertVisibilityInstanceToSlot(
    root: InternalNode,
    props: PropDefinition[]
  ): PropDefinition[] {
    // sourceKey → PropDefinition 매핑
    const propMap = new Map(props.map((p) => [p.sourceKey, p]));

    // visibility 제어 INSTANCE의 prop 이름과 노드 ID 수집
    // propName → SlotBindingInfo (sourceKey + 연결된 INSTANCE ID들)
    const slotInfo = new Map<string, SlotBindingInfo>();

    // nodeId → propName 역매핑 (INSTANCE에서 정확한 prop을 찾기 위해)
    const nodeToSlotProp = new Map<string, string>();

    // 1. componentPropertyReferences.visible 방식 (BOOLEAN 타입)
    this.collectVisibilityProps(root, propMap, slotInfo, nodeToSlotProp);

    // 2. VARIANT True/False 패턴 방식 (visibility-pattern)
    this.collectVariantVisibilitySlots(root, props, slotInfo, nodeToSlotProp);

    // INSTANCE 노드에 bindings 설정 (slot prop 바인딩)
    this.applySlotBindings(root, propMap, slotInfo, nodeToSlotProp);

    // 3. VARIANT True/False 패턴으로 감지된 INSTANCE에도 bindings 적용
    this.applyVariantSlotBindings(root, props, slotInfo, nodeToSlotProp);

    // boolean prop → slot으로 업그레이드
    return props.map((prop) => {
      if (slotInfo.has(prop.name)) {
        return {
          ...prop,
          type: "slot",
          // defaultValue를 null로 설정 (React.ReactNode의 기본값)
          defaultValue: null,
        };
      }
      return prop;
    });
  }

  /**
   * 트리를 순회하며 visibility 제어 INSTANCE의 prop과 노드 ID 수집
   * (componentPropertyReferences.visible 방식)
   */
  private collectVisibilityProps(
    node: InternalNode,
    propMap: Map<string, PropDefinition>,
    slotInfo: Map<string, SlotBindingInfo>,
    nodeToSlotProp: Map<string, string>
  ): void {
    // INSTANCE 노드이고 componentPropertyReferences.visible이 있으면
    if (
      node.type === "INSTANCE" &&
      node.componentPropertyReferences?.visible
    ) {
      const visibleRef = node.componentPropertyReferences.visible;

      // visibleRef를 그대로 sourceKey로 사용 (propMap 키와 동일)
      const sourceKey = visibleRef;

      // propMap에서 해당 prop 찾기
      const propDef = propMap.get(sourceKey);

      if (propDef && propDef.type === "boolean") {
        // boolean 타입이면 slot으로 변환 대상
        const existing = slotInfo.get(propDef.name);
        if (existing) {
          existing.nodeIds.add(node.id);
        } else {
          slotInfo.set(propDef.name, {
            sourceKey,
            nodeIds: new Set([node.id]),
          });
        }
        // 역매핑 추가
        nodeToSlotProp.set(node.id, propDef.name);
      }
    }

    // 자식 노드 재귀 처리
    if (node.children) {
      for (const child of node.children) {
        this.collectVisibilityProps(child, propMap, slotInfo, nodeToSlotProp);
      }
    }
  }

  /**
   * VARIANT True/False 패턴으로 제어되는 INSTANCE 수집
   *
   * slot 타입 props 중 "icon", "image" 등의 패턴을 가진 것을 찾고,
   * INSTANCE의 mergedNodes.variantName에서 해당 prop의 True variant에만
   * 존재하는지 확인합니다.
   *
   * 예: "Left Icon" prop → INSTANCE가 "Left Icon=True" variant에만 존재
   */
  private collectVariantVisibilitySlots(
    root: InternalNode,
    props: PropDefinition[],
    slotInfo: Map<string, SlotBindingInfo>,
    nodeToSlotProp: Map<string, string>
  ): void {
    // slot 타입 props 중 visibility-pattern 후보 수집
    // (icon, image 등의 패턴 + VARIANT True/False에서 온 것)
    const slotPatternProps = props.filter(
      (p) =>
        p.type === "slot" &&
        this.isSlotPattern(p.name) &&
        !slotInfo.has(p.name) // 이미 처리된 것 제외
    );

    if (slotPatternProps.length === 0) return;

    // 각 slot prop에 대해 INSTANCE 탐색
    this.traverseAndCollectVariantSlots(root, slotPatternProps, slotInfo, nodeToSlotProp);
  }

  /**
   * 트리를 순회하며 VARIANT visibility-pattern INSTANCE 수집
   */
  private traverseAndCollectVariantSlots(
    node: InternalNode,
    slotPatternProps: PropDefinition[],
    slotInfo: Map<string, SlotBindingInfo>,
    nodeToSlotProp: Map<string, string>
  ): void {
    // INSTANCE 노드이고 mergedNodes가 있으면
    if (node.type === "INSTANCE" && node.mergedNodes?.length) {
      for (const prop of slotPatternProps) {
        // 이미 이 노드가 다른 prop에 연결되어 있으면 스킵
        if (nodeToSlotProp.has(node.id)) continue;

        // sourceKey에서 prop 이름 추출 ("Left Icon#123:456" → "Left Icon")
        const propKey = prop.sourceKey.split("#")[0].trim();

        // True/False 패턴 확인
        const truePatterns = [`${propKey}=True`, `${propKey}=true`];
        const falsePatterns = [`${propKey}=False`, `${propKey}=false`];

        const hasTrue = node.mergedNodes.some((m) =>
          truePatterns.some((p) => m.variantName?.includes(p))
        );
        const hasFalse = node.mergedNodes.some((m) =>
          falsePatterns.some((p) => m.variantName?.includes(p))
        );

        // True variant에만 존재하면 이 prop과 연결
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
          // 역매핑 추가 - 이 노드는 이 prop과 연결됨
          nodeToSlotProp.set(node.id, prop.name);
          // 이 노드는 하나의 prop과만 연결되어야 하므로 break
          break;
        }
      }
    }

    // 자식 노드 재귀 처리
    if (node.children) {
      for (const child of node.children) {
        this.traverseAndCollectVariantSlots(child, slotPatternProps, slotInfo, nodeToSlotProp);
      }
    }
  }

  /**
   * INSTANCE 노드에 slot bindings 적용
   * (componentPropertyReferences.visible 방식)
   */
  private applySlotBindings(
    node: InternalNode,
    propMap: Map<string, PropDefinition>,
    slotInfo: Map<string, SlotBindingInfo>,
    nodeToSlotProp: Map<string, string>
  ): void {
    // INSTANCE 노드이고 visibility prop이 있으면
    if (
      node.type === "INSTANCE" &&
      node.componentPropertyReferences?.visible
    ) {
      const visibleRef = node.componentPropertyReferences.visible;
      const propDef = propMap.get(visibleRef);

      if (propDef && slotInfo.has(propDef.name)) {
        // bindings에 content 추가 (slot prop 바인딩)
        node.bindings = {
          ...node.bindings,
          content: { prop: propDef.name },
        };
      }
    }

    // 자식 노드 재귀 처리
    if (node.children) {
      for (const child of node.children) {
        this.applySlotBindings(child, propMap, slotInfo, nodeToSlotProp);
      }
    }
  }

  /**
   * VARIANT visibility-pattern INSTANCE에 bindings 적용
   *
   * nodeToSlotProp 역매핑을 사용하여 정확한 prop을 찾습니다.
   */
  private applyVariantSlotBindings(
    node: InternalNode,
    props: PropDefinition[],
    slotInfo: Map<string, SlotBindingInfo>,
    nodeToSlotProp: Map<string, string>
  ): void {
    // INSTANCE 노드이고 아직 bindings가 없으면
    if (
      node.type === "INSTANCE" &&
      !node.bindings?.content
    ) {
      // 역매핑에서 이 노드와 연결된 prop 찾기
      const propName = nodeToSlotProp.get(node.id);
      if (propName) {
        node.bindings = {
          ...node.bindings,
          content: { prop: propName },
        };
      }
    }

    // 자식 노드 재귀 처리
    if (node.children) {
      for (const child of node.children) {
        this.applyVariantSlotBindings(child, props, slotInfo, nodeToSlotProp);
      }
    }
  }

  /**
   * Slot 패턴인지 확인 (icon, image 등 React.ReactNode를 받을 수 있는 패턴)
   */
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
}
