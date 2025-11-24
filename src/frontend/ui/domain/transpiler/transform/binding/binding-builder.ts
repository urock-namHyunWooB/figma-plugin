import { BindingModel } from "../../types";
import { ComponentSetNodeSpec } from "@backend/managers/SpecManager";
import {
  inferBindingsFromStructureComparison,
  type SlotInfo,
} from "./element/infer-bindings-from-structure";

export function buildBindingModel(spec: ComponentSetNodeSpec): {
  bindings: BindingModel;
  slots: SlotInfo[];
} {
  // 기존 elementBindings를 기준으로 시작
  const baseBindings = spec.elementBindings || {};

  // componentStructure를 기준으로 다른 variant들과 비교하여 자동 바인딩 추론
  if (spec.componentStructure && spec.componentsReferences) {
    const { bindings: inferredBindings, slots } =
      inferBindingsFromStructureComparison(
        spec.componentStructure,
        spec.componentsReferences,
        spec.propsDefinition
      );

    // 추론된 바인딩을 기존 바인딩과 병합
    // (기존 바인딩이 우선, 없으면 추론된 바인딩 사용)
    const mergedBindings = { ...baseBindings };
    for (const [elementId, binding] of Object.entries(inferredBindings)) {
      if (!mergedBindings[elementId]) {
        mergedBindings[elementId] = binding;
      }
    }

    return { bindings: mergedBindings, slots };
  }

  return { bindings: baseBindings, slots: [] };
}
