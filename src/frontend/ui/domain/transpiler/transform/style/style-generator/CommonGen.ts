import type { LayoutTreeNode } from "@backend/managers/ComponentStructureManager";
import { Generator } from "./Generator";

export class CommonGen extends Generator {
  public override convert(
    style: Record<string, any>,
    node: LayoutTreeNode,
    figmaType: string,
  ) {
    return this.applyBaseStyles(style, node, figmaType);
  }
}

