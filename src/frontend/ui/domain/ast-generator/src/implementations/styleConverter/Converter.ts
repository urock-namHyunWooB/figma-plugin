import type { LayoutTreeNode } from "@backend/managers/ComponentStructureManager";

export type StylePipelineOptions = {
  includeSize?: boolean;
  includeColor?: boolean;
  includePadding?: boolean;
};

/**
 * Figma Fill 타입 정의
 */
type FigmaFill = {
  type: string;
  color: { r: number; g: number; b: number };
  opacity?: number;
};

/**
 * Figma Padding 타입 정의
 */
type FigmaPadding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export abstract class Converter {
  public abstract convert(
    style: Record<string, any>,
    node: LayoutTreeNode,
    figmaType: string,
  ): Record<string, any>;

  protected applyBaseStyles(
    style: Record<string, any>,
    node: LayoutTreeNode,
    figmaType: string,
    options: StylePipelineOptions = {},
  ): Record<string, any> {
    const {
      includeSize = true,
      includeColor = true,
      includePadding = true,
    } = options;

    if (includeSize) {
      this.addSizeStyles(style, node);
    }

    if (includeColor) {
      this.addColorStyles(style, node, figmaType);
    }

    if (includePadding) {
      this.addPaddingStyle(style, node);
    }

    return style;
  }

  /**
   * 색상 스타일 추가 (color 또는 backgroundColor)
   *
   */
  protected addColorStyles(
    style: Record<string, any>,
    node: LayoutTreeNode,
    figmaType: string,
  ): void {
    const fills = this.extractFills(node);
    if (!fills || fills.length === 0) {
      return;
    }

    const solidFill = this.findSolidFill(fills);
    if (!solidFill) {
      return;
    }

    const rgbColor = this.convertColorToRgb(solidFill.color);

    style["backgroundColor"] = rgbColor;

    this.addOpacityStyle(style, solidFill);
  }

  /**
   * 크기 스타일 추가 (width, height)
   */
  protected addSizeStyles(
    style: Record<string, any>,
    node: LayoutTreeNode,
  ): void {
    if (typeof node.width === "number") {
      style.width = node.width;
    }
    if (typeof node.height === "number") {
      style.height = node.height;
    }
  }

  /**
   * 투명도 스타일 추가 (opacity)
   */
  private addOpacityStyle(style: Record<string, any>, fill: FigmaFill): void {
    if (typeof fill.opacity === "number") {
      style.opacity = fill.opacity;
    }
  }

  /**
   * 패딩 스타일 추가 (padding)
   */
  protected addPaddingStyle(
    style: Record<string, any>,
    node: LayoutTreeNode,
  ): void {
    const padding = this.extractPadding(node);
    if (!padding) {
      return;
    }

    style.padding = this.formatPadding(padding);
  }

  /**
   * 노드에서 fills 배열 추출
   */
  protected extractFills(node: LayoutTreeNode): FigmaFill[] | undefined {
    const anyNode = node as any;
    if (!anyNode || !Array.isArray(anyNode.fills)) {
      return undefined;
    }

    return anyNode.fills.filter((fill: any) => {
      return (
        fill &&
        typeof fill.type === "string" &&
        fill.color &&
        typeof fill.color.r === "number" &&
        typeof fill.color.g === "number" &&
        typeof fill.color.b === "number"
      );
    });
  }

  /**
   * SOLID 타입의 fill 찾기
   */
  protected findSolidFill(fills: FigmaFill[]): FigmaFill | null {
    const solidFill = fills.find((fill) => fill.type === "SOLID" && fill.color);
    return solidFill || null;
  }

  /**
   * Figma 색상 객체를 RGB 문자열로 변환
   * 예: { r: 1, g: 0.5, b: 0 } → "rgb(255, 128, 0)"
   */
  protected convertColorToRgb(color: {
    r: number;
    g: number;
    b: number;
  }): string {
    // Figma는 0-1 범위의 값을 사용하므로 255를 곱해 변환
    const r = Math.round(color.r);
    const g = Math.round(color.g);
    const b = Math.round(color.b);
    return `rgb(${r}, ${g}, ${b})`;
  }

  /**
   * 노드에서 padding 정보 추출
   */
  protected extractPadding(node: LayoutTreeNode): FigmaPadding | undefined {
    const anyNode = node as any;
    if (!anyNode || !anyNode.padding || typeof anyNode.padding !== "object") {
      return undefined;
    }

    const { top, right, bottom, left } = anyNode.padding;
    if (
      [top, right, bottom, left].some(
        (value) => typeof value !== "number" || Number.isNaN(value),
      )
    ) {
      return undefined;
    }

    return anyNode.padding as FigmaPadding;
  }

  /**
   * 패딩 객체를 CSS padding 문자열로 변환
   * 예: { top: 10, right: 20, bottom: 10, left: 20 } → "10px 20px 10px 20px"
   */
  protected formatPadding(padding: FigmaPadding): string {
    return `${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px`;
  }

  protected removeSizeProperties(style: Record<string, any>): void {
    delete style.width;
    delete style.height;
  }
}
