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
  getBaseVariant(componentSet: ComponentSetNode): ComponentNode | null {
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
  extractStructure(
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
}
