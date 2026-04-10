import type { SemanticNode } from "../../SemanticIR";

export interface RadixSubPrimitive {
  role: string;
  primitive: string;
  identify: (node: SemanticNode) => boolean;
  childContent: "vector-child" | "lucide-check" | "none";
}

export interface RadixComponentConfig {
  packageName: string;
  importAlias: string;
  rootPrimitive: string;
  subPrimitives: RadixSubPrimitive[];
  extraImports?: string[];
  nativeRadixProps: Set<string>;
  nativeRadixAttrs: Set<string>;
}

const registry = new Map<string, RadixComponentConfig>();

export function registerRadixConfig(componentType: string, config: RadixComponentConfig): void {
  registry.set(componentType, config);
}

export function getRadixConfig(componentType: string): RadixComponentConfig | undefined {
  return registry.get(componentType);
}

export function isRadixMappable(componentType: string | undefined): boolean {
  return !!componentType && registry.has(componentType);
}
