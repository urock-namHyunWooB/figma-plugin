import { inferBindingsFromStructureComparison } from "./element/infer-bindings-from-structure";
import { FigmaNodeData, BaseStyleTree } from "../../types/figma-api";
import { FigmaNodeTree } from "../../types/tree";

export function buildBindingModel(
  spec: FigmaNodeData,
  baseStyle: BaseStyleTree
): FigmaNodeTree {
  // baseStyle을 기준으로 모든 variant들과 비교하여 Slot 추론
  return inferBindingsFromStructureComparison(spec, baseStyle);
}
