import type { ElementASTNode } from "../../../types";

class StyleConverter {
  public convert(node: ElementASTNode): ElementASTNode {
    if (!node.props.style) {
      console.warn(`No style found for ${node.name}`);
      return node;
    }

    if (node.originalType === "TEXT") {
      node.props.style.color = node.props.style.backgroundColor;
      delete node.props.style.backgroundColor;
      delete node.props.style.width;
      delete node.props.style.height;
    }

    return node;
  }
}

export default StyleConverter;

