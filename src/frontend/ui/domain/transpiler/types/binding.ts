// ====== Binding 레이어에서 쓸 타입 ======

import { ElementBindingsMap } from "@backend/managers/MetadataManager";

export type PropKind = "variant" | "primitive" | "component";

export interface PropBinding {
  id: string; // prop-xxxx
  name: string; // text, Size, leftIcon ...
  kind: PropKind;
  tsType: string; // "'Large' | 'Medium' | 'Small'" | "string" | "React.ReactNode"
  defaultValue?: any;
  required: boolean;
}

export type ElementBindingMode =
  | "content"
  | "component"
  | "visibility"
  | "custom";

export interface VariantRule {
  variantPropName: string; // e.g. "Size"
  variantValue: string; // e.g. "Large"
  diff: Record<string, any>; // width/height/fills 등 스타일 변화
}

export type BindingSourceKind = "prop" | "state";

export interface ElementBindingModel {
  nodeId: string;
  nodeName: string;
  nodeType: string;

  sourceKind: BindingSourceKind; // 'prop' | 'state'
  sourceId: string; // prop-xxx or state-xxx
  sourceName: string; // text / isOpen / count ...

  mode: ElementBindingMode;
  visibleMode: "always" | "condition";
  visibleExpression?: string;
}

export interface StateBinding {
  id: string; // state-xxx
  name: string; // isOpen, isActive ...
  tsType: string; // boolean | number | ...
  defaultValue?: any;
}

export type BindingModel = ElementBindingsMap | null;
