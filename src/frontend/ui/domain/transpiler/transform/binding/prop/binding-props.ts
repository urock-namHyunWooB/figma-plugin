import { PropBinding, PropKind } from "../../../types";
import { PropDefinition } from "@backend/managers/MetadataManager";
import { ComponentSetNodeSpec } from "@backend/managers/SpecManager";

// RawPropDefinition -> TS 타입 문자열
export function toTsType(def: PropDefinition): string {
  // 1) Variant 타입
  if (def.type === "VARIANT" && def.variantOptions?.length) {
    // ex) 'Large' | 'Medium' | 'Small'
    return def.variantOptions.map((v) => `'${v}'`).join(" | ");
  }

  // 2) 기본 스칼라 타입들
  if (def.type === "string") return "string";
  if (def.type === "boolean") return "boolean";
  if (def.type === "number") return "number";

  // 3) 컴포넌트 타입
  if (def.type === "component") {
    // 필요에 따라 React.ReactElement | null 등으로 바꿀 수 있음
    return "component";
  }

  // 4) 그 외 아직 정의 안 한 타입들
  return "any";
}

// RawPropDefinition -> PropKind
export function toPropKind(def: PropDefinition): PropKind {
  if (def.type === "VARIANT") return "variant";
  if (def.type === "component") return "component";
  return "primitive";
}

// 핵심: RawComponentSpec -> PropBinding[]
export function buildPropBindings(spec: ComponentSetNodeSpec): PropBinding[] {
  return spec.propsDefinition.map((def) => ({
    id: def.id,
    name: def.name,
    kind: toPropKind(def),
    tsType: toTsType(def),
    defaultValue: def.defaultValue,
    required: !!def.required,
  }));
}
