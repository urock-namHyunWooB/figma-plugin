import {
  SceneNode,
  Paint,
  DropShadowEffect,
  InnerShadowEffect,
  BlurEffect,
  Effect,
} from "@figma/plugin-typings/plugin-api-standalone";
import {
  BaseStyleProperties,
  Padding,
  ConvertedRGB,
  ConvertedFill,
  ConvertedStroke,
  ConvertedEffect,
} from "../types/styles";

/**
 * 스타일 정보 타입 (LayoutTreeNode의 스타일 부분)
 */
export type ExtractedStyles = BaseStyleProperties;

export class StyleExtractor {
  private static readonly ROUND_PRECISION = 100;

  constructor() {}

  /**
   * 숫자를 소수점 2자리까지 반올림
   */
  private roundToTwoDecimals(value: number): number {
    return (
      Math.round(value * StyleExtractor.ROUND_PRECISION) /
      StyleExtractor.ROUND_PRECISION
    );
  }

  /**
   * Figma RGB를 0-255 범위로 변환
   */
  private convertRGBColor(color: {
    r: number;
    g: number;
    b: number;
  }): ConvertedRGB {
    return {
      r: Math.round(color.r * 255),
      g: Math.round(color.g * 255),
      b: Math.round(color.b * 255),
    };
  }

  /**
   * Paint를 ConvertedFill로 변환
   */
  private convertPaintToFillInfo(fill: Paint): ConvertedFill {
    if (fill.type === "SOLID") {
      return {
        type: fill.type,
        color: this.convertRGBColor(fill.color),
        visible: fill.visible,
        opacity: fill.opacity || 1,
      };
    }
    return { type: fill.type };
  }

  /**
   * Paint를 ConvertedStroke로 변환
   */
  private convertPaintToStrokeInfo(stroke: Paint): ConvertedStroke {
    if (stroke.type === "SOLID") {
      return {
        type: stroke.type,
        color: this.convertRGBColor(stroke.color),
      };
    }
    return { type: stroke.type };
  }

  /**
   * 노드에서 모든 스타일 정보 추출
   */
  public extractStyles(
    node: SceneNode | any,
    parentNode?: SceneNode | any,
    parentPadding?: Padding
  ): ExtractedStyles {
    const styles: ExtractedStyles = {};

    // 위치 정보 추출
    if ("x" in node && "y" in node) {
      styles.x = this.roundToTwoDecimals(node.x);
      styles.y = this.roundToTwoDecimals(node.y);
    }

    // 회전 정보 추출
    if ("rotation" in node && node.rotation !== 0) {
      styles.rotation = this.roundToTwoDecimals(node.rotation);
    }

    // 가시성 정보 추출
    if ("visible" in node) {
      styles.visible = node.visible;
    }

    // 잠금 상태 추출
    if ("locked" in node) {
      styles.locked = node.locked;
    }

    // Fill 정보 추출
    this.extractFills(node, styles);

    // Stroke 정보 추출
    this.extractStrokes(node, styles);

    // Corner Radius 추출
    this.extractCornerRadius(node, styles);

    // Effects 추출
    this.extractEffects(node, styles);

    // Opacity 추출
    if ("opacity" in node && node.opacity !== 1) {
      styles.opacity = this.roundToTwoDecimals(node.opacity);
    }

    // Blend Mode 추출
    if ("blendMode" in node && node.blendMode !== "PASS_THROUGH") {
      styles.blendMode = node.blendMode;
    }

    // Constraints 추출
    if ("constraints" in node) {
      styles.constraints = node.constraints;
    }

    // Auto Layout 정보 추출
    this.extractAutoLayout(node, styles);

    // Layout Grow, Align, Sizing 추출
    this.extractLayoutProperties(node, styles);

    // Overflow 추출
    if ("overflow" in node) {
      styles.overflow = (node as any).overflow;
    }

    // Clips Content 추출
    if ("clipsContent" in node) {
      styles.clipsContent = (node as any).clipsContent;
    }

    // Padding 정보 추출
    this.extractPadding(node, styles);

    // Margin 계산
    this.calculateMargin(node, parentNode, parentPadding, styles);

    return styles;
  }

  /**
   * Fill 정보 추출
   */
  private extractFills(node: SceneNode | any, styles: ExtractedStyles): void {
    if ("fills" in node && Array.isArray(node.fills)) {
      const fills = node.fills as Paint[];
      if (fills.length > 0) {
        styles.fills = fills.map((fill) => this.convertPaintToFillInfo(fill));
      }
    }
  }

  /**
   * Stroke 정보 추출
   */
  private extractStrokes(node: SceneNode | any, styles: ExtractedStyles): void {
    this.extractStrokeColors(node, styles);
    this.extractStrokeProperties(node, styles);
    this.extractGeometry(node, styles);
  }

  /**
   * Stroke 색상 추출
   */
  private extractStrokeColors(
    node: SceneNode | any,
    styles: ExtractedStyles
  ): void {
    if ("strokes" in node && Array.isArray(node.strokes)) {
      const strokes = node.strokes as Paint[];
      if (strokes.length > 0) {
        styles.strokes = strokes.map((stroke) =>
          this.convertPaintToStrokeInfo(stroke)
        );
      }
    }
  }

  /**
   * Stroke 속성 추출 (Weight, Align, Cap, Join, Miter Limit, Dashes)
   */
  private extractStrokeProperties(
    node: SceneNode | any,
    styles: ExtractedStyles
  ): void {
    if (
      "strokeWeight" in node &&
      typeof node.strokeWeight === "number" &&
      node.strokeWeight > 0
    ) {
      styles.strokeWeight = node.strokeWeight;
    }

    if ("strokeAlign" in node) {
      styles.strokeAlign = (node as any).strokeAlign;
    }

    if ("strokeCap" in node) {
      styles.strokeCap = (node as any).strokeCap;
    }

    if ("strokeJoin" in node) {
      styles.strokeJoin = (node as any).strokeJoin;
    }

    if (
      "strokeMiterLimit" in node &&
      typeof (node as any).strokeMiterLimit === "number"
    ) {
      styles.strokeMiterLimit = (node as any).strokeMiterLimit;
    }

    if ("strokeDashes" in node && Array.isArray((node as any).strokeDashes)) {
      const dashes = (node as any).strokeDashes;
      if (dashes.length > 0) {
        styles.strokeDashes = dashes;
      }
    }
  }

  /**
   * Geometry 정보 추출 (Fill, Stroke)
   */
  private extractGeometry(
    node: SceneNode | any,
    styles: ExtractedStyles
  ): void {
    // if ("fillGeometry" in node && Array.isArray((node as any).fillGeometry)) {
    //   styles.fillGeometry = (node as any).fillGeometry;
    // }

    if (
      "strokeGeometry" in node &&
      Array.isArray((node as any).strokeGeometry)
    ) {
      styles.strokeGeometry = (node as any).strokeGeometry;
    }
  }

  /**
   * Corner Radius 추출
   */
  private extractCornerRadius(
    node: SceneNode | any,
    styles: ExtractedStyles
  ): void {
    if (
      "cornerRadius" in node &&
      typeof node.cornerRadius === "number" &&
      node.cornerRadius !== 0
    ) {
      styles.cornerRadius = node.cornerRadius;
    }
  }

  /**
   * Effect를 ConvertedEffect로 변환
   */
  private convertEffectToEffectInfo(effect: Effect): ConvertedEffect {
    const effectData: ConvertedEffect = {
      type: effect.type,
      visible: effect.visible,
    };

    // Drop Shadow / Inner Shadow
    if (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW") {
      const shadowEffect = effect as DropShadowEffect | InnerShadowEffect;
      effectData.radius = shadowEffect.radius;
      effectData.offset = shadowEffect.offset;
      effectData.color = {
        ...this.convertRGBColor(shadowEffect.color),
        a: shadowEffect.color.a,
      };
      if (shadowEffect.spread !== undefined) {
        effectData.spread = shadowEffect.spread;
      }
    }

    // Layer Blur / Background Blur
    if (effect.type === "LAYER_BLUR" || effect.type === "BACKGROUND_BLUR") {
      const blurEffect = effect as BlurEffect;
      effectData.radius = blurEffect.radius;
    }

    return effectData;
  }

  /**
   * Effects 추출
   */
  private extractEffects(node: SceneNode | any, styles: ExtractedStyles): void {
    if (
      "effects" in node &&
      Array.isArray(node.effects) &&
      node.effects.length > 0
    ) {
      styles.effects = node.effects.map((effect: Effect) =>
        this.convertEffectToEffectInfo(effect)
      );
    }
  }

  /**
   * Auto Layout 정보 추출
   */
  private extractAutoLayout(
    node: SceneNode | any,
    styles: ExtractedStyles
  ): void {
    if ("layoutMode" in node && node.layoutMode !== "NONE") {
      styles.layoutMode = node.layoutMode;

      if ("primaryAxisSizingMode" in node) {
        styles.primaryAxisSizingMode = (node as any).primaryAxisSizingMode;
      }

      if ("counterAxisSizingMode" in node) {
        styles.counterAxisSizingMode = (node as any).counterAxisSizingMode;
      }

      if ("primaryAxisAlignItems" in node) {
        styles.primaryAxisAlignItems = (node as any).primaryAxisAlignItems;
      }

      if ("counterAxisAlignItems" in node) {
        styles.counterAxisAlignItems = (node as any).counterAxisAlignItems;
      }

      if ("itemSpacing" in node) {
        styles.itemSpacing = (node as any).itemSpacing;
      }
    }
  }

  /**
   * Layout 속성 추출 (Grow, Align, Sizing)
   */
  private extractLayoutProperties(
    node: SceneNode | any,
    styles: ExtractedStyles
  ): void {
    // Layout Grow 추출 (자식 노드의 grow 속성)
    if ("layoutGrow" in node) {
      styles.layoutGrow = (node as any).layoutGrow;
    }

    // Layout Align 추출 (자식 노드의 align 속성)
    if ("layoutAlign" in node) {
      styles.layoutAlign = (node as any).layoutAlign;
    }

    // Layout Sizing Horizontal 추출
    if ("layoutSizingHorizontal" in node) {
      styles.layoutSizingHorizontal = (node as any).layoutSizingHorizontal;
    }

    // Layout Sizing Vertical 추출
    if ("layoutSizingVertical" in node) {
      styles.layoutSizingVertical = (node as any).layoutSizingVertical;
    }
  }

  /**
   * Padding 정보 추출
   */
  private extractPadding(node: SceneNode | any, styles: ExtractedStyles): void {
    if (
      "paddingTop" in node ||
      "paddingRight" in node ||
      "paddingBottom" in node ||
      "paddingLeft" in node
    ) {
      styles.padding = {
        top: (node as any).paddingTop || 0,
        right: (node as any).paddingRight || 0,
        bottom: (node as any).paddingBottom || 0,
        left: (node as any).paddingLeft || 0,
      };
    }
  }

  /**
   * Margin 계산
   */
  private calculateMargin(
    node: SceneNode | any,
    parentNode: SceneNode | any | undefined,
    parentPadding: Padding | undefined,
    styles: ExtractedStyles
  ): void {
    if (!parentNode || !parentPadding || !("x" in node) || !("y" in node)) {
      return;
    }

    const parentPaddingLeft = parentPadding.left || 0;
    const parentPaddingTop = parentPadding.top || 0;

    // 자식 노드의 상대 위치에서 부모의 padding을 빼면 마진
    const marginLeft = Math.max(0, node.x - parentPaddingLeft);
    const marginTop = Math.max(0, node.y - parentPaddingTop);

    // 마진이 0보다 크면 설정
    if (marginLeft > 0 || marginTop > 0) {
      styles.margin = {
        top: marginTop,
        right: 0, // 오른쪽과 아래는 마지막 자식이 아니면 계산 어려움
        bottom: 0,
        left: marginLeft,
      };
    }
  }
}
