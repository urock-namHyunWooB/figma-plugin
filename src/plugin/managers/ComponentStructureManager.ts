/**
 * Component Structure 관리 클래스
 * 단일 책임: ComponentSet의 구조 추출
 */

interface StructureElement {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  padding?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  margin?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  layout?: {
    layoutMode: "NONE" | "HORIZONTAL" | "VERTICAL";
    itemSpacing: number;
    primaryAxisAlignItems?: string;
    counterAxisAlignItems?: string;
    layoutGrow?: number;
    layoutAlign?: string;
  };
  children?: StructureElement[];
}

interface ComponentStructureData {
  baseVariantId: string;
  baseVariantName: string;
  elements: StructureElement[];
  boundingBox: {
    width: number;
    height: number;
  };
  padding?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  layout?: {
    layoutMode: "NONE" | "HORIZONTAL" | "VERTICAL";
    itemSpacing: number;
    primaryAxisAlignItems?: string;
    counterAxisAlignItems?: string;
  };
}

export class ComponentStructureManager {
  /**
   * ComponentSet의 Base variant (첫 번째 variant) 찾기
   */
  public getBaseVariant(componentSet: ComponentSetNode): ComponentNode | null {
    const children = componentSet.children;
    if (children.length === 0) return null;

    // 첫 번째 COMPONENT 찾기
    const firstComponent = children.find(
      (child) => child.type === "COMPONENT"
    ) as ComponentNode | undefined;

    return firstComponent || null;
  }

  /**
   * 노드의 구조를 재귀적으로 추출
   */
  private extractNodeStructure(node: SceneNode): StructureElement {
    const element: StructureElement = {
      id: node.id,
      name: node.name,
      type: node.type,
      x: "x" in node ? node.x : 0,
      y: "y" in node ? node.y : 0,
      width: "width" in node ? node.width : 0,
      height: "height" in node ? node.height : 0,
      visible: node.visible,
    };

    // padding / layout (Frame, Component, Instance 등 Auto Layout 관련 속성이 있는 노드)
    const hasAutoLayoutProps =
      "layoutMode" in (node as any) &&
      typeof (node as any).layoutMode === "string";

    if (hasAutoLayoutProps) {
      const n = node as unknown as {
        layoutMode: "NONE" | "HORIZONTAL" | "VERTICAL";
        itemSpacing: number;
        primaryAxisAlignItems?: string;
        counterAxisAlignItems?: string;
        paddingTop?: number;
        paddingRight?: number;
        paddingBottom?: number;
        paddingLeft?: number;
      };

      element.layout = {
        layoutMode: n.layoutMode ?? "NONE",
        itemSpacing: n.itemSpacing ?? 0,
        primaryAxisAlignItems: n.primaryAxisAlignItems,
        counterAxisAlignItems: n.counterAxisAlignItems,
      };

      // Set padding if available
      if (
        typeof n.paddingTop === "number" ||
        typeof n.paddingRight === "number" ||
        typeof n.paddingBottom === "number" ||
        typeof n.paddingLeft === "number"
      ) {
        element.padding = {
          top: n.paddingTop ?? 0,
          right: n.paddingRight ?? 0,
          bottom: n.paddingBottom ?? 0,
          left: n.paddingLeft ?? 0,
        };
      }
    }

    // children이 있는 노드 타입들
    if (
      "children" in node &&
      Array.isArray(node.children) &&
      node.children.length > 0
    ) {
      const parentLayoutMode = element.layout?.layoutMode ?? "NONE";
      const parentItemSpacing = element.layout?.itemSpacing ?? 0;

      element.children = node.children.map((child, index) => {
        const childElement = this.extractNodeStructure(child);

        // child-specific layout align/grow if available
        const c: any = child as any;
        if (childElement.layout == null) {
          childElement.layout = {
            layoutMode: "NONE",
            itemSpacing: 0,
          };
        }
        if ("layoutAlign" in c) {
          childElement.layout.layoutAlign = c.layoutAlign;
        }
        if ("layoutGrow" in c) {
          childElement.layout.layoutGrow = c.layoutGrow;
        }

        // derive margin from parent's auto layout spacing
        if (parentLayoutMode !== "NONE" && parentItemSpacing > 0) {
          const isFirst = index === 0;
          const isLast = index === node.children.length - 1;
          const spacing = parentItemSpacing;

          if (parentLayoutMode === "VERTICAL") {
            childElement.margin = {
              top: isFirst ? 0 : spacing,
              bottom: 0,
              left: 0,
              right: 0,
            };
          } else if (parentLayoutMode === "HORIZONTAL") {
            childElement.margin = {
              left: isFirst ? 0 : spacing,
              right: 0,
              top: 0,
              bottom: 0,
            };
          }
        }

        return childElement;
      });
    }

    return element;
  }

  /**
   * ComponentSet의 전체 구조 데이터 추출
   */
  public extractStructure(
    componentSet: ComponentSetNode
  ): ComponentStructureData | null {
    const baseVariant = this.getBaseVariant(componentSet);
    if (!baseVariant) {
      return null;
    }

    const elements: StructureElement[] = baseVariant.children.map((child) =>
      this.extractNodeStructure(child)
    );

    // Base variant의 padding/layout도 구조에 포함
    let rootPadding:
      | { top: number; right: number; bottom: number; left: number }
      | undefined;
    let rootLayout:
      | {
          layoutMode: "NONE" | "HORIZONTAL" | "VERTICAL";
          itemSpacing: number;
          primaryAxisAlignItems?: string;
          counterAxisAlignItems?: string;
        }
      | undefined;

    const baseAny = baseVariant as unknown as {
      layoutMode?: "NONE" | "HORIZONTAL" | "VERTICAL";
      itemSpacing?: number;
      primaryAxisAlignItems?: string;
      counterAxisAlignItems?: string;
      paddingTop?: number;
      paddingRight?: number;
      paddingBottom?: number;
      paddingLeft?: number;
    };

    if (typeof baseAny.layoutMode === "string") {
      rootLayout = {
        layoutMode: baseAny.layoutMode ?? "NONE",
        itemSpacing: baseAny.itemSpacing ?? 0,
        primaryAxisAlignItems: baseAny.primaryAxisAlignItems,
        counterAxisAlignItems: baseAny.counterAxisAlignItems,
      };
    }

    if (
      typeof baseAny.paddingTop === "number" ||
      typeof baseAny.paddingRight === "number" ||
      typeof baseAny.paddingBottom === "number" ||
      typeof baseAny.paddingLeft === "number"
    ) {
      rootPadding = {
        top: baseAny.paddingTop ?? 0,
        right: baseAny.paddingRight ?? 0,
        bottom: baseAny.paddingBottom ?? 0,
        left: baseAny.paddingLeft ?? 0,
      };
    }

    return {
      baseVariantId: baseVariant.id,
      baseVariantName: baseVariant.name,
      elements,
      boundingBox: {
        width: baseVariant.width,
        height: baseVariant.height,
      },
      padding: rootPadding,
      layout: rootLayout,
    };
  }

  /**
   * variant별 스타일 매핑 추출
   * 각 variant 속성 값별로 공통되는 스타일 정보를 추출
   */
  public extractVariantStyles(
    componentSet: ComponentSetNode
  ): Record<string, any> | null {
    const propertyDefinitions = componentSet.componentPropertyDefinitions;
    if (!propertyDefinitions) {
      return null;
    }

    const variants: Array<{
      variantProperties: Record<string, string | boolean> | null;
      styles: any;
    }> = [];

    // 모든 variant의 스타일 추출
    componentSet.children.forEach((child) => {
      if (child.type === "COMPONENT") {
        const component = child as ComponentNode;
        const styles = this.extractComponentStyles(component);

        variants.push({
          variantProperties: component.variantProperties,
          styles: styles,
        });
      }
    });

    if (variants.length === 0) {
      return null;
    }

    // 프로퍼티별 스타일 매핑 분석
    return this.analyzePropertyStyleMapping(variants, propertyDefinitions);
  }

  /**
   * Component의 스타일 추출
   */
  private extractComponentStyles(component: ComponentNode): any {
    const styles: any = {};

    // 크기 정보
    if ("width" in component && "height" in component) {
      styles.width = Math.round(component.width * 100) / 100;
      styles.height = Math.round(component.height * 100) / 100;
    }

    // Fill 정보
    if ("fills" in component && Array.isArray(component.fills)) {
      const fills = component.fills as Paint[];
      if (fills.length > 0) {
        styles.fills = fills.map((fill) => {
          if (fill.type === "SOLID") {
            return {
              type: fill.type,
              color: {
                r: Math.round(fill.color.r * 255),
                g: Math.round(fill.color.g * 255),
                b: Math.round(fill.color.b * 255),
              },
              opacity: fill.opacity || 1,
            };
          }
          return { type: fill.type };
        });
      }
    }

    // Stroke 정보
    if ("strokes" in component && Array.isArray(component.strokes)) {
      const strokes = component.strokes as Paint[];
      if (strokes.length > 0) {
        styles.strokes = strokes.map((stroke) => {
          if (stroke.type === "SOLID") {
            return {
              type: stroke.type,
              color: {
                r: Math.round(stroke.color.r * 255),
                g: Math.round(stroke.color.g * 255),
                b: Math.round(stroke.color.b * 255),
              },
            };
          }
          return { type: stroke.type };
        });
      }
    }

    if (
      "strokeWeight" in component &&
      typeof component.strokeWeight === "number" &&
      component.strokeWeight > 0
    ) {
      styles.strokeWeight = component.strokeWeight;
    }

    // Corner Radius
    if ("cornerRadius" in component && component.cornerRadius !== 0) {
      styles.cornerRadius = component.cornerRadius;
    }

    // Effects
    if ("effects" in component && component.effects.length > 0) {
      styles.effects = component.effects.map((effect) => ({
        type: effect.type,
        visible: effect.visible,
      }));
    }

    // Opacity
    if ("opacity" in component && component.opacity !== 1) {
      styles.opacity = Math.round(component.opacity * 100) / 100;
    }

    // Layout (Auto Layout) 정보
    if ("layoutMode" in component && component.layoutMode !== "NONE") {
      styles.layoutMode = component.layoutMode;
      styles.primaryAxisSizingMode = component.primaryAxisSizingMode;
      styles.counterAxisSizingMode = component.counterAxisSizingMode;
      styles.paddingLeft = component.paddingLeft;
      styles.paddingRight = component.paddingRight;
      styles.paddingTop = component.paddingTop;
      styles.paddingBottom = component.paddingBottom;
      styles.itemSpacing = component.itemSpacing;
    }

    return styles;
  }

  /**
   * 프로퍼티별 스타일 매핑 분석
   */
  private analyzePropertyStyleMapping(
    variants: Array<{
      variantProperties: Record<string, string | boolean> | null;
      styles: any;
    }>,
    propertyDefinitions: ComponentPropertyDefinitions
  ): Record<string, any> {
    const propertyStyleMap: Record<string, any> = {};

    // 각 프로퍼티별로 분석
    Object.keys(propertyDefinitions).forEach((propName) => {
      const propDef = propertyDefinitions[propName];

      // VARIANT 타입만 분석 (BOOLEAN은 단순 on/off이므로 별도 처리)
      if (propDef.type === "VARIANT" && propDef.variantOptions) {
        propertyStyleMap[propName] = {};

        propDef.variantOptions.forEach((optionValue) => {
          // 이 옵션 값을 가진 variants 찾기
          const matchingVariants = variants.filter(
            (v) =>
              v.variantProperties &&
              v.variantProperties[propName] === optionValue
          );

          if (matchingVariants.length > 0) {
            // 이 옵션에서 공통적으로 나타나는 스타일 찾기
            const commonStyles = this.findCommonStyles(
              matchingVariants.map((v) => v.styles)
            );

            if (Object.keys(commonStyles).length > 0) {
              propertyStyleMap[propName][optionValue] = commonStyles;
            }
          }
        });
      } else if (propDef.type === "BOOLEAN") {
        // BOOLEAN 타입 처리
        propertyStyleMap[propName] = {
          true: {},
          false: {},
        };

        [true, false].forEach((boolValue) => {
          const matchingVariants = variants.filter(
            (v) =>
              v.variantProperties && v.variantProperties[propName] === boolValue
          );

          if (matchingVariants.length > 0) {
            const commonStyles = this.findCommonStyles(
              matchingVariants.map((v) => v.styles)
            );

            if (Object.keys(commonStyles).length > 0) {
              propertyStyleMap[propName][boolValue.toString()] = commonStyles;
            }
          }
        });
      }
    });

    return propertyStyleMap;
  }

  /**
   * 여러 스타일 객체에서 공통 스타일 찾기
   */
  private findCommonStyles(stylesArray: any[]): any {
    if (stylesArray.length === 0) return {};

    const commonStyles: any = {};
    const firstStyle = stylesArray[0];

    // 첫 번째 스타일의 각 속성을 체크
    Object.keys(firstStyle).forEach((key) => {
      // 모든 스타일에서 이 속성이 동일한 값을 가지는지 확인
      const allSame = stylesArray.every((style) => {
        return JSON.stringify(style[key]) === JSON.stringify(firstStyle[key]);
      });

      if (allSame) {
        commonStyles[key] = firstStyle[key];
      }
    });

    return commonStyles;
  }
}
