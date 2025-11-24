import type { LayoutTreeNode } from "@backend/managers/ComponentStructureManager";

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

export type StylePipelineOptions = {
  includeSize?: boolean;
  includeColor?: boolean;
  includePadding?: boolean;
};

/**
 * Layout 노드를 스타일 객체로 변환하는 기본 구현체
 */
class StyleConverter {
  constructor() {}

  /**
   * Layout 노드를 CSS 스타일 객체로 변환
   *
   * 변환 과정:
   * 1. 크기 정보 (width, height)
   * 2. 색상 정보 (fills에서 추출)
   * 3. 투명도 정보 (opacity)
   * 4. 패딩 정보 (padding)
   * 5. 테두리 정보 (border, borderRadius)
   * 6. 레이아웃 정보 (display, flexDirection, gap, alignItems, justifyContent)
   * 7. 마진 정보 (margin)
   */
  public layoutNodeToStyle(node: LayoutTreeNode | undefined | null) {
    if (!node) {
      return {};
    }

    const style = {};

    this.addSizeStyles(style, node);
    this.addColorStyles(style, node);
    this.addPaddingStyle(style, node);
    this.addBorderStyles(style, node);
    this.addLayoutStyles(style, node);
    this.addMarginStyle(style, node);

    return style;
  }

  /**
   * 색상 스타일 추가 (color 또는 backgroundColor)
   *
   */
  protected addColorStyles(
    style: Record<string, any>,
    node: LayoutTreeNode,
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

  /**
   * 테두리 스타일 추가 (border, borderRadius)
   */
  protected addBorderStyles(
    style: Record<string, any>,
    node: LayoutTreeNode,
  ): void {
    const anyNode = node as any;

    // Border radius
    if (typeof anyNode.cornerRadius === "number") {
      style.borderRadius = `${anyNode.cornerRadius}px`;
    }

    // Border (strokes)
    if (Array.isArray(anyNode.strokes) && anyNode.strokes.length > 0) {
      const stroke = anyNode.strokes[0];
      if (stroke && stroke.type === "SOLID" && stroke.color) {
        const strokeColor = this.convertColorToRgb(stroke.color);
        const strokeWeight = anyNode.strokeWeight || 1;
        style.border = `${strokeWeight}px solid ${strokeColor}`;
      }
    }
  }

  /**
   * 레이아웃 스타일 추가 (Flexbox)
   */
  protected addLayoutStyles(
    style: Record<string, any>,
    node: LayoutTreeNode,
  ): void {
    const anyNode = node as any;

    // layoutMode가 있으면 flexbox로 변환
    if (anyNode.layoutMode) {
      style.display = "flex";

      // VERTICAL → column, HORIZONTAL → row
      if (anyNode.layoutMode === "VERTICAL") {
        style.flexDirection = "column";
      } else if (anyNode.layoutMode === "HORIZONTAL") {
        style.flexDirection = "row";
      }

      // itemSpacing → gap
      if (typeof anyNode.itemSpacing === "number") {
        style.gap = `${anyNode.itemSpacing}px`;
      }

      // primaryAxisAlignItems → justifyContent
      if (anyNode.primaryAxisAlignItems) {
        style.justifyContent = this.mapAlignmentToFlex(
          anyNode.primaryAxisAlignItems,
        );
      }

      // counterAxisAlignItems → alignItems
      if (anyNode.counterAxisAlignItems) {
        style.alignItems = this.mapAlignmentToFlex(
          anyNode.counterAxisAlignItems,
        );
      }
    }

    // layoutSizing → flexbox sizing
    if (anyNode.layoutSizingHorizontal === "FILL") {
      style.flexGrow = 1;
    }
    if (anyNode.layoutSizingVertical === "FILL") {
      style.flexGrow = 1;
    }
  }

  /**
   * 마진 스타일 추가 (margin)
   */
  protected addMarginStyle(
    style: Record<string, any>,
    node: LayoutTreeNode,
  ): void {
    const anyNode = node as any;
    if (!anyNode || !anyNode.margin || typeof anyNode.margin !== "object") {
      return;
    }

    const { top, right, bottom, left } = anyNode.margin;
    if (
      [top, right, bottom, left].some(
        (value) => typeof value !== "number" || Number.isNaN(value),
      )
    ) {
      return;
    }

    style.margin = `${top}px ${right}px ${bottom}px ${left}px`;
  }

  /**
   * Figma alignment를 Flexbox 속성으로 매핑
   */
  protected mapAlignmentToFlex(alignment: string): string {
    const alignmentMap: Record<string, string> = {
      MIN: "flex-start",
      CENTER: "center",
      MAX: "flex-end",
      SPACE_BETWEEN: "space-between",
    };

    return alignmentMap[alignment] || "flex-start";
  }
}

export const styleConverter = new StyleConverter();
