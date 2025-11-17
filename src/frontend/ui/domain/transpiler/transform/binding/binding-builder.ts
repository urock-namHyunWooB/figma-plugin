import { BindingModel } from "../../types";
import { buildPropBindings } from "./prop/binding-props";
import { buildElementBindings } from "./element/binding-elements";
import { buildVariantRules } from "./variant-rules";
import { ComponentSetNodeSpec } from "@backend/managers/SpecManager";
import {
  PropDefinition,
  StateDefinition,
} from "@backend/managers/MetadataManager";
import { buildStateBindings } from "./state/binding-state";

export function buildBindingModel(spec: ComponentSetNodeSpec): BindingModel {
  // 1) props
  const props = buildPropBindings(spec);
  const propsById = new Map<string, PropDefinition>(
    spec.propsDefinition.map((d) => [d.id, d]),
  );

  // 2) state
  const state = buildStateBindings(spec);
  const statesById = new Map<string, StateDefinition>(
    (spec.internalStateDefinition ?? []).map((s) => [s.id, s]),
  );

  // 3) elements (props + state 모두 지원)
  const elements = buildElementBindings(spec, propsById, statesById);

  // 4) variant rules
  const variantRules = buildVariantRules(spec);

  return {
    componentName: spec.metadata.name,
    rootElement: spec.metadata.rootElement,
    props,
    state,
    elements,
    variantRules,
  };
}
