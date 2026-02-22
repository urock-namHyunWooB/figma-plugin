import type { InternalNode, PropDefinition } from "../../../../types/types";

/**
 * InstanceSlotProcessor
 *
 * visibility prop으로 제어되는 INSTANCE를 slot으로 변환
 *
 * 변환 조건:
 * 1. INSTANCE 노드에 componentPropertyReferences.visible 존재
 * 2. 해당 prop이 boolean 타입
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

    // visibility 제어 INSTANCE의 prop 이름 수집
    const visibilityPropNames = new Set<string>();
    this.collectVisibilityProps(root, propMap, visibilityPropNames);

    // boolean prop → slot으로 업그레이드
    return props.map((prop) => {
      if (visibilityPropNames.has(prop.name)) {
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
   * 트리를 순회하며 visibility 제어 INSTANCE의 prop 수집
   */
  private collectVisibilityProps(
    node: InternalNode,
    propMap: Map<string, PropDefinition>,
    visibilityPropNames: Set<string>
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
        visibilityPropNames.add(propDef.name);
      }
    }

    // 자식 노드 재귀 처리
    if (node.children) {
      for (const child of node.children) {
        this.collectVisibilityProps(child, propMap, visibilityPropNames);
      }
    }
  }
}
