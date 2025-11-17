import type { LayoutTreeNode } from "@backend/managers/ComponentStructureManager";
import { Generator } from "./Generator";

export class TextStyleGen extends Generator {
  constructor() {
    super();
  }

  public override convert(
    style: Record<string, any>,
    node: LayoutTreeNode,
    figmaType: string,
  ) {
    this.applyBaseStyles(style, node, figmaType, { includeSize: false });
    return style;
  }

  public override addColorStyles(
    style: Record<string, any>,
    node: LayoutTreeNode,
    figmaType: string,
  ) {
    super.addColorStyles(style, node, figmaType);

    style.color = style.backgroundColor;
    delete style.backgroundColor;
  }
}

