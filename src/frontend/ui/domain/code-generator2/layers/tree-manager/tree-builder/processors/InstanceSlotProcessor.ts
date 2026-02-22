import type { InternalNode, PropDefinition } from "../../../../types/types";

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
    const slotInfo = new Map<string, string>(); // propName → nodeId

    // 1. componentPropertyReferences.visible 방식 (BOOLEAN 타입)
    this.collectVisibilityProps(root, propMap, slotInfo);

    // 2. VARIANT True/False 패턴 방식 (visibility-pattern)
    this.collectVariantVisibilitySlots(root, props, slotInfo);

    // INSTANCE 노드에 bindings 설정 (slot prop 바인딩)
    this.applySlotBindings(root, propMap, slotInfo);

    // 3. VARIANT True/False 패턴으로 감지된 INSTANCE에도 bindings 적용
    this.applyVariantSlotBindings(root, props, slotInfo);

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
    slotInfo: Map<string, string> // propName → sourceKey
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
        slotInfo.set(propDef.name, sourceKey);
      }
    }

    // 자식 노드 재귀 처리
    if (node.children) {
      for (const child of node.children) {
        this.collectVisibilityProps(child, propMap, slotInfo);
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
    slotInfo: Map<string, string>
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
    this.traverseAndCollectVariantSlots(root, slotPatternProps, slotInfo);
  }

  /**
   * 트리를 순회하며 VARIANT visibility-pattern INSTANCE 수집
   */
  private traverseAndCollectVariantSlots(
    node: InternalNode,
    slotPatternProps: PropDefinition[],
    slotInfo: Map<string, string>
  ): void {
    // INSTANCE 노드이고 mergedNodes가 있으면
    if (node.type === "INSTANCE" && node.mergedNodes?.length) {
      for (const prop of slotPatternProps) {
        if (slotInfo.has(prop.name)) continue;

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
          slotInfo.set(prop.name, prop.sourceKey);
        }
      }
    }

    // 자식 노드 재귀 처리
    if (node.children) {
      for (const child of node.children) {
        this.traverseAndCollectVariantSlots(child, slotPatternProps, slotInfo);
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
    slotInfo: Map<string, string> // propName → sourceKey
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
        this.applySlotBindings(child, propMap, slotInfo);
      }
    }
  }

  /**
   * VARIANT visibility-pattern INSTANCE에 bindings 적용
   */
  private applyVariantSlotBindings(
    node: InternalNode,
    props: PropDefinition[],
    slotInfo: Map<string, string>
  ): void {
    // INSTANCE 노드이고 아직 bindings가 없고 mergedNodes가 있으면
    if (
      node.type === "INSTANCE" &&
      !node.bindings?.content &&
      node.mergedNodes?.length
    ) {
      // 이 INSTANCE와 연결된 slot prop 찾기
      for (const [propName, sourceKey] of slotInfo.entries()) {
        const propKey = sourceKey.split("#")[0].trim();
        const truePatterns = [`${propKey}=True`, `${propKey}=true`];
        const falsePatterns = [`${propKey}=False`, `${propKey}=false`];

        const hasTrue = node.mergedNodes.some((m) =>
          truePatterns.some((p) => m.variantName?.includes(p))
        );
        const hasFalse = node.mergedNodes.some((m) =>
          falsePatterns.some((p) => m.variantName?.includes(p))
        );

        // True variant에만 존재하면 bindings 적용
        if (hasTrue && !hasFalse) {
          node.bindings = {
            ...node.bindings,
            content: { prop: propName },
          };
          break; // 하나의 prop만 연결
        }
      }
    }

    // 자식 노드 재귀 처리
    if (node.children) {
      for (const child of node.children) {
        this.applyVariantSlotBindings(child, props, slotInfo);
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
