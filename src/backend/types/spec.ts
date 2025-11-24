import type {
  ElementBindingsMap,
  PropDefinition,
  StateDefinition,
} from "@backend/managers/MetadataManager";
import type {
  ComponentStructureData,
  LayoutTreeNode,
} from "@backend/managers/ComponentStructureManager";
import { SceneNode } from "@figma/plugin-typings/plugin-api-standalone";
import { FigmaNodeData } from "@frontend/ui/domain/transpiler/types/figma-api";

//TODO COMPONENT_SET node 타입이면 variantPatterns가 있음.
export interface NodeSpec {
  metadata: {
    name: string;
    rootElement: string;
    nodeType: SceneNode["type"];
  };
  propsDefinition: PropDefinition[];
  internalStateDefinition: StateDefinition[] | null;
  elementBindings: ElementBindingsMap | null;

  componentStructure: ComponentStructureData | null;
  layoutTree: LayoutTreeNode | null;

  variantPatterns?: Record<string, Record<string, unknown>>;
  figmaInfo: FigmaNodeData;
}
