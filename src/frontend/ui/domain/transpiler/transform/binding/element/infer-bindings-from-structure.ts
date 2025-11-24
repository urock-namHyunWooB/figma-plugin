import type { ComponentStructureData } from "@backend/managers/ComponentStructureManager";
import type { PropDefinition } from "@backend/managers/MetadataManager";
import type { ElementBindingsMap } from "@backend/managers/MetadataManager";
import { normalizePropName } from "../../props/props-builder";

/**
 * Slot 정보: 어떤 elementId가 어떤 prop 때문에 Slot으로 유추되었는지
 */
export interface SlotInfo {
  elementId: string;
  propId: string;
  propName: string;
}

/**
 * componentStructure를 기준으로 다른 variant들과 비교하여 자동 바인딩 추론
 *
 * 로직:
 * 1. componentStructure의 root.children을 기준으로 설정
 * 2. 다른 variant들의 root.children과 비교
 * 3. componentStructure에만 있는 노드 = Slot으로 처리, 특정 prop과 매칭 가능
 * 4. 모든 variant에 공통인 노드 = 다른 prop과 매칭 가능
 */
export function inferBindingsFromStructureComparison(
  componentStructure: ComponentStructureData,
  componentsReferences: Array<{
    componentId: string;
    componentName: string;
    componentStructure: ComponentStructureData;
    layoutTree: any;
  }>,
  propsDefinition: PropDefinition[]
): {
  bindings: ElementBindingsMap;
  slots: SlotInfo[];
} {
  const inferredBindings: ElementBindingsMap = {};
  const slots: SlotInfo[] = [];

  if (!componentStructure.root.children) {
    return { bindings: inferredBindings, slots };
  }

  // componentStructure의 root children 수집
  const baseChildren = componentStructure.root.children;

  // componentStructure와 같은 variant는 제외하고 다른 variant들의 root children 수집
  const otherVariantChildren = componentsReferences
    .filter(
      (ref) => ref.componentStructure.root.id !== componentStructure.root.id
    )
    .map((ref) => {
      return ref.componentStructure.root.children || [];
    });

  // 각 baseChildren의 노드에 대해 분석
  for (let i = 0; i < baseChildren.length; i++) {
    const baseChild = baseChildren[i];

    // 다른 variant들에서 같은 이름+타입의 노드가 있는지 확인 (위치 무관)
    // componentStructure에 있는 노드가 다른 variant에서 "없어지는지" 확인
    // 모든 다른 variant에서 찾아야 함 (일부에만 있으면 안 됨)
    let foundCount = 0;
    for (const otherChildren of otherVariantChildren) {
      const found = otherChildren.some(
        (otherChild) =>
          otherChild.name === baseChild.name &&
          otherChild.type === baseChild.type
      );
      if (found) {
        foundCount++;
      }
    }

    // 모든 다른 variant에 있으면 공통 요소, 일부에만 있거나 없으면 Slot 후보
    const existsInAllOtherVariants = foundCount === otherVariantChildren.length;

    // componentStructure에만 있는 노드 (모든 다른 variant에 없음 = 없어지는 노드)
    if (!existsInAllOtherVariants) {
      // element 이름 기반으로 prop 이름 추론
      const normalizedName = normalizePropName(baseChild.name);
      const inferredPropName = normalizedName;

      // propsDefinition에서 매칭되는 모든 prop 찾기 (여러 prop과 매칭될 수 있음)
      // 정확한 매칭만 허용 (부분 매칭은 오매칭을 방지하기 위해 제외)
      const matchingProps = propsDefinition.filter((prop) => {
        const normalizedPropName = normalizePropName(prop.name);

        // 정확한 매칭만 허용
        return normalizedPropName === inferredPropName;
      });

      // prop 매칭이 성공한 경우에만 바인딩 생성
      if (matchingProps.length > 0) {
        // 첫 번째 매칭된 prop을 바인딩에 사용
        const firstMatchingProp = matchingProps[0];
        inferredBindings[baseChild.id] = {
          elementId: baseChild.id,
          elementName: baseChild.name,
          elementType: baseChild.type,
          connectedPropName: `prop:${normalizePropName(firstMatchingProp.name)}`,
          connectedTargetId: firstMatchingProp.id,
          visibleMode: "always",
          visibleExpression: "",
        };
      }

      // Slot 정보 저장 (prop 매칭 여부와 관계없이 Slot으로 판정된 노드는 Slot 정보에 추가)
      // 매칭된 prop이 있으면 추가, 없으면 빈 propId/propName으로 추가
      if (matchingProps.length > 0) {
        // 매칭된 prop들을 Slot 정보로 저장
        for (const matchingProp of matchingProps) {
          slots.push({
            elementId: baseChild.id,
            propId: matchingProp.id,
            propName: normalizePropName(matchingProp.name),
          });
        }
      } else {
        // prop 매칭이 실패해도 Slot으로 판정된 노드는 Slot 정보에 추가 (slotProp은 빈 배열)
        slots.push({
          elementId: baseChild.id,
          propId: "", // prop 매칭 실패
          propName: "", // prop 매칭 실패
        });
      }
    }
  }

  return { bindings: inferredBindings, slots };
}
