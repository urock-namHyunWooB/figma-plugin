import { LayoutTreeNode } from "@backend/managers/ComponentStructureManager";
import { Converter } from "./Converter";

export class TextStyleConverter extends Converter {
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
