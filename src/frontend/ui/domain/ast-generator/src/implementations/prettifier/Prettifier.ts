import type { ComponentAST, ElementASTNode } from "../../ast";
import type { IPrettifier } from "../../interfaces/IPrettifier";

/**
 * ComponentAST를 정리하고 최적화하는 구현체
 */
export class Prettifier implements IPrettifier {
  public prettify(ast: ComponentAST): ComponentAST {
    const prettifiedRoot = this.prettifyNode(ast.root);
    return {
      ...ast,
      root: prettifiedRoot ?? ast.root,
    };
  }

  private prettifyNode(node: ElementASTNode): ElementASTNode | null {
    // 1) 스타일 클린업
    const cleanedStyle = this.cleanStyle(node);

    if (this.shouldRemoveNode(node, cleanedStyle)) {
      return null;
    }

    const prettifiedChildren = this.prettifyChildren(node.children);

    // children을 업데이트한 node 임시 객체
    const updatedNode: ElementASTNode = {
      ...node,
      props: {
        ...node.props,
        style: cleanedStyle,
      },
      children: prettifiedChildren,
    };

    // 4) 레이아웃-only 래퍼면 자식으로 대체
    // if (this.isLayoutOnlyWrapper(updatedNode, cleanedStyle)) {
    //   // 자식은 무조건 1개라고 가정해도 됨 (검사했으니까)
    //   return updatedNode.children[0];
    // }

    return updatedNode;
  }

  private prettifyChildren(children: ElementASTNode[]): ElementASTNode[] {
    return children
      .map((child) => this.prettifyNode(child))
      .filter((child): child is ElementASTNode => child !== null);
  }

  private shouldRemoveNode(
    node: ElementASTNode,
    cleanedStyle: Record<string, any>,
  ): boolean {
    const isHrTag = node.tag === "hr";
    const hasNoHeight =
      cleanedStyle.height === 0 || cleanedStyle.height === undefined;
    return isHrTag && hasNoHeight;
  }

  private cleanStyle(node: ElementASTNode): Record<string, any> {
    const rawStyle = node.props?.style ?? {};
    const style: Record<string, any> = { ...rawStyle };

    this.removeDefaultOpacity(style);
    this.removeZeroPadding(style);
    this.roundNumericValues(style);

    return style;
  }

  private removeDefaultOpacity(style: Record<string, any>): void {
    if (style.opacity === 1) {
      delete style.opacity;
    }
  }

  private removeZeroPadding(style: Record<string, any>): void {
    if (
      typeof style.padding === "string" &&
      this.isZeroPadding(style.padding)
    ) {
      delete style.padding;
    }
  }

  private isZeroPadding(padding: string): boolean {
    return padding.replace(/\s+/g, "") === "0px0px0px0px";
  }

  private roundNumericValues(style: Record<string, any>): void {
    for (const key of Object.keys(style)) {
      const value = style[key];
      if (typeof value === "number") {
        style[key] = Math.round(value * 100) / 100;
      }
    }
  }

  private isTextNode(node: ElementASTNode): boolean {
    return node.originalType === "TEXT";
  }

  private isLayoutOnlyWrapper(
    node: ElementASTNode,
    style: Record<string, any>,
  ): boolean {
    // 1) div가 아니면 스킵
    if (node.tag !== "div") return false;

    // 2) children이 1개가 아니면 스킵
    if (node.children.length !== 1) return false;

    // 3) 의미 있는 스타일이 있으면 스킵
    // 여기서 "의미 있는" 기준은 점점 다듬어가면 된다.
    const meaningfulKeys = [
      "backgroundColor",
      "color",
      "borderRadius",
      "boxShadow",
    ];

    if (meaningfulKeys.some((k) => style[k] !== undefined)) {
      return false;
    }

    // 4) width/height 정도만 있어도 일단은 "레이아웃-only" 로 본다
    const allowedKeys = ["width", "height"]; // 나중에 flex 관련 스타일은 여기에 추가 가능
    const styleKeys = Object.keys(style);

    // style에 있는 키가 전부 허용 리스트 안에 있으면 layout-only로 취급
    return styleKeys.every((key) => allowedKeys.includes(key));
  }
}
