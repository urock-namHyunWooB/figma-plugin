import { BaseStyleTree, FigmaNodeData, StyleTree } from "../../types/figma-api";
import { findStyleTreeById } from "../../utils/tree-utils";
import VariantUtils from "@frontend/ui/utils/variant";

export class VariantStyleBuilder {
  constructor(
    private spec: FigmaNodeData,
    private sharedBaseStyle: BaseStyleTree
  ) {}

  /**
   * spec의 variantPatterns를 처리하여 variant style을 생성
   * @param spec FigmaNodeData
   * @param sharedBaseStyle
   */
  buildVariantStyles() {
    const spec = this.spec;
    const sharedBaseStyle = this.sharedBaseStyle;
    if (spec.info.document.type !== "COMPONENT_SET") {
      return null;
    }

    const componentSetNode = spec.info.document as ComponentSetNode;
    const variantsMaps: Record<string, StyleTree> = {};

    componentSetNode.children.forEach((child) => {
      if (child.type === "COMPONENT") {
        const component = child as ComponentNode;
        const id = component.id;

        const styleNode = findStyleTreeById(spec.styleTree!, id);
        if (styleNode) {
          variantsMaps[component.name] = styleNode;
        }
      }
    });
    const variantPatterns = VariantUtils.extractVariantPatterns(
      variantsMaps,
      sharedBaseStyle.baseVariants
    );

    return variantPatterns;
  }
}

export function buildVariantStyles(
  spec: FigmaNodeData,
  sharedBaseStyle: BaseStyleTree
) {}
