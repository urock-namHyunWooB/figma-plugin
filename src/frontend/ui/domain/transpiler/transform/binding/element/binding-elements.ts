import {
  ElementBindingModel,
  ElementBindingMode,
  BindingSourceKind,
} from "../../../types";
import { ComponentSetNodeSpec } from "@backend/managers/SpecManager";
import {
  PropDefinition,
  StateDefinition,
} from "@backend/managers/MetadataManager";
import { normalizePropName } from "../../props/props-builder";

// "prop:text" | "state:isOpen" -> { kind, name }
function parseConnectedName(raw: string): {
  sourceKind: BindingSourceKind;
  name: string;
} {
  if (raw.startsWith("prop:")) {
    return { sourceKind: "prop", name: raw.slice("prop:".length) };
  }
  if (raw.startsWith("state:")) {
    return { sourceKind: "state", name: raw.slice("state:".length) };
  }
  // prefix 없으면 일단 prop으로 가정
  return { sourceKind: "prop", name: raw };
}

// elementBinding의 mode 추론 (props/state 둘 다 공용)
function inferBindingMode(
  elementType: string,
  valueType?: string,
): ElementBindingMode {
  if (elementType === "TEXT" && valueType === "string") return "content";
  if (valueType === "component") return "component";
  // boolean state에 따라 visibility 조건 걸고 싶으면 나중에 여기 확장
  return "custom";
}

// export function buildElementBindings(
//   spec: ComponentSetNodeSpec,
//   propsById: Map<string, PropDefinition>,
//   statesById?: Map<string, StateDefinition>,
// ): ElementBindingModel[] {
//   if (!spec.elementBindings) return [];
//
//   return Object.values(spec.elementBindings).map((raw) => {
//     const { sourceKind, name } = parseConnectedName(raw.connectedPropName);
//
//     let valueType: string | undefined;
//     const sourceId = raw.connectedTargetId;
//
//     if (sourceKind === "prop") {
//       const propDef = propsById.get(sourceId);
//       valueType = propDef?.type;
//     } else {
//       const stateDef = statesById?.get(sourceId);
//       valueType = stateDef?.type;
//     }
//
//     return {
//       nodeId: raw.elementId,
//       nodeName: raw.elementName,
//       nodeType: raw.elementType,
//
//       sourceKind,
//       sourceId,
//       sourceName: name,
//
//       mode: inferBindingMode(raw.elementType, valueType),
//       visibleMode: raw.visibleMode === "always" ? "always" : "condition",
//       visibleExpression:
//         raw.visibleMode === "always" ? undefined : raw.visibleExpression,
//     };
//   });
// }

export function buildElementBindings(
  spec: ComponentSetNodeSpec,
  propsById: Map<string, PropDefinition>,
  statesById?: Map<string, StateDefinition>,
): ElementBindingModel[] {
  if (!spec.elementBindings) return [];

  return Object.values(spec.elementBindings)
    .map((raw): ElementBindingModel | undefined => {
      const propId = raw.connectedTargetId;
      const propName = raw.connectedPropName;
      if (!propId || !propName) {
        console.warn("propId or propName 없음");
        return undefined;
      }

      const { sourceKind, name } = parseConnectedName(propName);

      let valueType: string | undefined;
      const sourceId = propId;
      let sourceName: string;

      if (sourceKind === "prop") {
        const propDef = propsById.get(sourceId);
        valueType = propDef?.type;
        // prop의 경우 normalizedName 사용 (함수 파라미터가 destructuring이므로)
        sourceName = propDef ? normalizePropName(propDef.name) : name;
      } else {
        const stateDef = statesById?.get(sourceId);
        valueType = stateDef?.type;
        // state의 경우 name 그대로 사용 (이미 camelCase일 가능성 높음)
        sourceName = name;
      }

      const binding: ElementBindingModel = {
        nodeId: raw.elementId,
        nodeName: raw.elementName,
        nodeType: raw.elementType,

        sourceKind, // parseConnectedName에서 파싱한 sourceKind 사용
        sourceId: propId,
        sourceName, // normalizedName 사용

        mode: inferBindingMode(raw.elementType, valueType),
        visibleMode: raw.visibleMode === "always" ? "always" : "condition",
        visibleExpression:
          raw.visibleMode === "always" ? undefined : raw.visibleExpression,
      };

      return binding;
    })
    .filter((binding): binding is ElementBindingModel => binding !== undefined);
}
