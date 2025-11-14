import type { LayoutTreeNode } from "@backend/managers/ComponentStructureManager";
import { Converter } from "./Converter";


export class CommonConverter extends Converter {
  public override convert(
    style: Record<string, any>,
    node: LayoutTreeNode,
    figmaType: string
  ) {
    return this.applyBaseStyles(style, node, figmaType);
  }
}
