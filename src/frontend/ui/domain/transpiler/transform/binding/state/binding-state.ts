import { StateBinding } from "../../../types";
import { StateDefinition } from "@backend/managers/MetadataManager";
import { ComponentSetNodeSpec } from "@backend/managers/SpecManager";

function stateTsType(def: StateDefinition): string {
  if (def.type === "boolean") return "boolean";
  if (def.type === "number") return "number";
  if (def.type === "string") return "string";
  // 필요하면 확장
  return "any";
}

export function buildStateBindings(spec: ComponentSetNodeSpec): StateBinding[] {
  const rawStates = spec.internalStateDefinition;
  if (!rawStates || rawStates.length === 0) return [];

  return rawStates.map((s) => ({
    id: s.id,
    name: s.name,
    tsType: stateTsType(s),
    defaultValue: s.initialValue,
  }));
}
