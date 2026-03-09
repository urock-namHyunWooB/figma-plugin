/**
 * PropsAdapter
 *
 * 내부 PropDefinition → 외부(UI) PropDefinition 변환
 *
 * 내부 파이프라인의 PropDefinition은 코드 생성에 최적화된 타입이고,
 * UI(PropController, App.tsx)는 미리보기용 메타데이터(mockupSvg, dimensions)가 필요하다.
 * 이 어댑터가 DataManager를 통해 부족한 정보를 보완하여 변환한다.
 */

import type { PropDefinition as InternalPropDefinition, SlotPropDefinition, FunctionPropDefinition, BooleanPropDefinition, ArraySlotInfo } from "../types/types";
import type { PropDefinition } from "../types/public";
import type DataManager from "../layers/data-manager/DataManager";

const TYPE_MAP: Record<string, PropDefinition["type"]> = {
  variant: "VARIANT",
  string: "TEXT",
  boolean: "BOOLEAN",
  slot: "SLOT",
  function: "function",
};

/**
 * 내부 PropDefinition 배열을 UI용 PropDefinition 배열로 변환
 */
export function toPublicProps(
  internalProps: InternalPropDefinition[],
  dataManager: DataManager,
  arraySlots?: ArraySlotInfo[]
): PropDefinition[] {
  const arraySlotMap = new Map(
    (arraySlots || []).map((s) => [s.slotName, s])
  );
  return internalProps.map((prop) => toPublicProp(prop, dataManager, arraySlotMap));
}

function toPublicProp(
  prop: InternalPropDefinition,
  dataManager: DataManager,
  arraySlotMap: Map<string, ArraySlotInfo>
): PropDefinition {
  const result: PropDefinition = {
    name: prop.name,
    type: TYPE_MAP[prop.type] ?? "TEXT",
    defaultValue: prop.defaultValue,
    variantOptions:
      prop.type === "variant" ? (prop as any).options : undefined,
    extraValues:
      prop.type === "boolean" ? (prop as BooleanPropDefinition).extraValues : undefined,
  };

  if (prop.type === "function") {
    result.functionSignature = (prop as FunctionPropDefinition).functionSignature;
  }

  if (prop.type === "slot") {
    const slotProp = prop as SlotPropDefinition;
    const componentId = slotProp.componentId;
    const mockupSvg = componentId
      ? dataManager.getMergedVectorSvgForComponent(componentId)
      : undefined;
    const nodeId = slotProp.nodeId;
    const rawNode = nodeId
      ? (dataManager.getById(nodeId).node as any)
      : undefined;
    const bbox = rawNode?.absoluteBoundingBox;

    result.slotInfo = {
      componentName: slotProp.componentName,
      hasDependency: slotProp.hasDependency ?? false,
      mockupSvg,
      width: bbox?.width,
      height: bbox?.height,
    };

    // Array slot 정보 매핑
    const arraySlot = arraySlotMap.get(prop.name);
    if (arraySlot?.itemProps) {
      result.arraySlotInfo = {
        itemProps: arraySlot.itemProps,
      };
    }
  }

  return result;
}
