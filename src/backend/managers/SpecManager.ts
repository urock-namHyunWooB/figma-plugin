import {
  findPairsEfficient,
  structuralDiff,
  extractVariantPatterns,
} from "../utils";
import { FigmaPlugin } from "../FigmaPlugin";
import type { ComponentStructureData } from "./ComponentStructureManager";
import type {
  PropDefinition,
  StateDefinition,
  ElementBindingsMap,
} from "./MetadataManager";
import type { LayoutTreeNode } from "./ComponentStructureManager";

/**
 * Component Set Node Spec 반환 타입
 * getComponentSetNodeSpec() 메서드의 반환 타입
 */
export interface ComponentSetNodeSpec {
  metadata: {
    name: string;
    rootElement: string;
  };
  propsDefinition: PropDefinition[];
  internalStateDefinition: StateDefinition[] | null;
  elementBindings: ElementBindingsMap | null;
  variantPatterns: Record<string, Record<string, unknown>>;
  componentStructure: ComponentStructureData;
  layoutTree: LayoutTreeNode;
}

class SpecManager {
  private figmaPlugin: FigmaPlugin;
  private metadataManager: FigmaPlugin["metadataManager"];
  private componentStructureManager: FigmaPlugin["componentStructureManager"];

  constructor(
    figmaPlugin: FigmaPlugin,
    metadataManager: FigmaPlugin["metadataManager"],
    componentStructureManager: FigmaPlugin["componentStructureManager"],
  ) {
    this.figmaPlugin = figmaPlugin;
    this.metadataManager = metadataManager;
    this.componentStructureManager = componentStructureManager;
  }

  /**
   * 컴포넌트 이름으로부터 적절한 root element 추론
   */
  private inferRootElement(componentName: string): string {
    const lowerName = componentName.toLowerCase();

    // HTML 태그 매핑
    if (lowerName.includes("button")) return "button";
    if (lowerName.includes("input")) return "input";
    if (lowerName.includes("form")) return "form";
    if (lowerName.includes("header")) return "header";
    if (lowerName.includes("footer")) return "footer";
    if (lowerName.includes("nav")) return "nav";
    if (lowerName.includes("section")) return "section";
    if (lowerName.includes("article")) return "article";
    if (lowerName.includes("aside")) return "aside";
    if (lowerName.includes("main")) return "main";

    // 기본값
    return "div";
  }

  public async getComponentSetNodeSpec(
    componentSetNode: ComponentSetNode,
  ): Promise<ComponentSetNodeSpec> {
    const componentPropertyDefinitions =
      componentSetNode.componentPropertyDefinitions;

    const variantsMaps: Record<string, any> = {};
    const componentNodes: ComponentNode[] = [];

    componentSetNode.children.forEach((child) => {
      if (child.type === "COMPONENT") {
        const component = child as ComponentNode;
        componentNodes.push(component);
        const componentSpec = this.getComponentNodeSpec(component);
        variantsMaps[component.name] = componentSpec;
      }
    });

    const variantPatterns = extractVariantPatterns(variantsMaps);

    const componentStructures = await Promise.all(
      componentNodes.map(async (component) => {
        return {
          component,
          structure:
            await this.componentStructureManager.extractComponentStructure(
              component,
              componentSetNode.name,
            ),
        };
      }),
    );

    // 기본 variant의 component를 찾기
    const defaultVariant = componentSetNode.defaultVariant;
    let defaultComponentStructure: ComponentStructureData | null = null;

    if (defaultVariant) {
      // 기본 variant에 해당하는 component structure 찾기
      const defaultStructure = componentStructures.find(
        ({ component }) => component.id === defaultVariant.id,
      );
      if (defaultStructure) {
        defaultComponentStructure =
          defaultStructure.structure.componentStructure;
      }
    }

    // 기본 variant의 structure가 없으면 자식 개수가 가장 많은 구조를 사용 (fallback)
    const componentStructure =
      defaultComponentStructure ||
      this.findStructureWithMostChildren(
        componentStructures.map(({ structure }) => ({
          componentStructure: structure.componentStructure,
        })),
      );

    const layoutTree = componentStructure
      ? await this.componentStructureManager.extractStyleTree(
          componentStructure,
        )
      : null;

    const propsDefinition =
      this.metadataManager.getCombinedPropsDefinition(componentSetNode);
    const internalStateDefinition =
      this.metadataManager.getInternalStateDefinition(componentSetNode);

    const elementBindings =
      this.metadataManager.getElementBindings(componentSetNode);

    const metadata = {
      name: componentSetNode.name,
      rootElement: this.inferRootElement(componentSetNode.name),
    };

    return {
      metadata,
      propsDefinition,
      internalStateDefinition,
      elementBindings,
      variantPatterns,
      componentStructure: componentStructure || null,
      layoutTree,
    };
  }

  public getComponentNodeSpec(componentNode: ComponentNode) {
    const children = componentNode.children.map((child) => {
      if (child.type === "TEXT") {
        return this.getTextNodeSpec(child);
      } else if (child.type === "RECTANGLE") {
        return this.getRectangleNodeSpec(child);
      } else if (child.type === "INSTANCE") {
        return this.getInstanceNodeSpec(child);
      } else if (child.type === "FRAME") {
        return this.getFrameNodeSpec(child);
      } else if (child.type === "VECTOR") {
        return this.getVectorNodeSpec(child);
      } else if (child.type === "ELLIPSE") {
        return this.getEllipseNodeSpec(child);
      } else if (child.type === "STAR") {
        return this.getStarNodeSpec(child);
      } else if (child.type === "POLYGON") {
        return this.getPolygonNodeSpec(child);
      }
    });

    // cornerRadius가 figma.mixed이거나 숫자가 아닌 경우 처리
    let cornerRadius: number | undefined = undefined;
    if (
      "cornerRadius" in componentNode &&
      typeof componentNode.cornerRadius === "number"
    ) {
      cornerRadius = componentNode.cornerRadius;
    }

    // fills 색상을 0..255 스케일로 변환
    const fills = componentNode.fills
      ? (componentNode.fills as Paint[]).map((fill) => {
          if (fill.type === "SOLID" && fill.color) {
            return {
              ...fill,
              color: {
                r: Math.round(fill.color.r * 255),
                g: Math.round(fill.color.g * 255),
                b: Math.round(fill.color.b * 255),
              },
            };
          }
          return fill;
        })
      : componentNode.fills;

    // strokes 색상을 0..255 스케일로 변환
    const strokes = componentNode.strokes
      ? (componentNode.strokes as Paint[]).map((stroke) => {
          if (stroke.type === "SOLID" && stroke.color) {
            return {
              ...stroke,
              color: {
                r: Math.round(stroke.color.r * 255),
                g: Math.round(stroke.color.g * 255),
                b: Math.round(stroke.color.b * 255),
              },
            };
          }
          return stroke;
        })
      : componentNode.strokes;

    const spec: any = {
      children,
      name: componentNode.name,
      id: componentNode.id,
      width: componentNode.width,
      height: componentNode.height,
      visible: componentNode.visible,
      fills,
      strokes,
      strokeWeight: componentNode.strokeWeight,
      opacity: componentNode.opacity,
      // fillGeometry: componentNode.fillGeometry,
      strokeGeometry: componentNode.strokeGeometry,
      strokeCap: componentNode.strokeCap,
      strokeMiterLimit: componentNode.strokeMiterLimit,
      paddingTop: componentNode.paddingTop,
      paddingRight: componentNode.paddingRight,
      paddingBottom: componentNode.paddingBottom,
      paddingLeft: componentNode.paddingLeft,
      layoutSizingVertical: componentNode.layoutSizingVertical,
      layoutSizingHorizontal: componentNode.layoutSizingHorizontal,
      layoutMode: componentNode.layoutMode,
      itemSpacing: componentNode.itemSpacing,
      primaryAxisAlignItems: componentNode.primaryAxisAlignItems,
      counterAxisAlignItems: componentNode.counterAxisAlignItems,
    };

    // cornerRadius가 유효한 숫자인 경우에만 추가
    if (cornerRadius !== undefined) {
      spec.cornerRadius = cornerRadius;
    }

    return spec;
  }

  public getTextNodeSpec(textNode: TextNode) {
    return {
      x: textNode.x,
      y: textNode.y,
      name: textNode.name,
      type: textNode.type,
      width: textNode.width,
      height: textNode.height,
      visible: textNode.visible,
      fills: textNode.fills,
      strokes: textNode.strokes,
      strokeWeight: textNode.strokeWeight,
      layoutSizingVertical: textNode.layoutSizingVertical,
      layoutSizingHorizontal: textNode.layoutSizingHorizontal,
      opacity: textNode.opacity,
      fillGeometry: textNode.fillGeometry,
    };
  }

  public getRectangleNodeSpec(rectangleNode: RectangleNode) {
    return {
      x: rectangleNode.x,
      y: rectangleNode.y,
      name: rectangleNode.name,
      type: rectangleNode.type,
    };
  }

  public getInstanceNodeSpec(instanceNode: InstanceNode) {
    return {
      x: instanceNode.x,
      y: instanceNode.y,
      name: instanceNode.name,
      type: instanceNode.type,
    };
  }

  public getFrameNodeSpec(frameNode: FrameNode) {
    return {
      x: frameNode.x,
      y: frameNode.y,
      name: frameNode.name,
      type: frameNode.type,
    };
  }

  public getVectorNodeSpec(vectorNode: VectorNode) {
    return {
      x: vectorNode.x,
      y: vectorNode.y,
      name: vectorNode.name,
      type: vectorNode.type,
    };
  }

  public getEllipseNodeSpec(ellipseNode: EllipseNode) {
    return {
      x: ellipseNode.x,
      y: ellipseNode.y,
      name: ellipseNode.name,
      type: ellipseNode.type,
    };
  }

  public getStarNodeSpec(starNode: StarNode) {
    return {
      x: starNode.x,
      y: starNode.y,
      name: starNode.name,
      type: starNode.type,
    };
  }

  public getPolygonNodeSpec(polygonNode: PolygonNode) {
    return {
      x: polygonNode.x,
      y: polygonNode.y,
      name: polygonNode.name,
      type: polygonNode.type,
    };
  }

  /**
   * 구조 배열에서 자식 개수가 가장 많은 구조를 찾기
   */
  private findStructureWithMostChildren(
    componentStructures: Array<{
      componentStructure: ComponentStructureData;
    }>,
  ): ComponentStructureData | null {
    if (componentStructures.length === 0) {
      return null;
    }

    let maxChildrenCount = -1;
    let structureWithMostChildren: ComponentStructureData | null = null;

    for (const { componentStructure } of componentStructures) {
      const childrenCount = this.countChildren(componentStructure.root);
      if (childrenCount > maxChildrenCount) {
        maxChildrenCount = childrenCount;
        structureWithMostChildren = componentStructure;
      }
    }

    return structureWithMostChildren;
  }

  /**
   * 구조 요소의 자식 개수를 재귀적으로 세기
   */
  private countChildren(element: {
    children?: Array<{ children?: any[] }>;
  }): number {
    if (!element.children || element.children.length === 0) {
      return 0;
    }

    // 직접 자식 개수 + 각 자식의 자식 개수
    return (
      element.children.length +
      element.children.reduce((sum, child) => {
        return sum + this.countChildren(child);
      }, 0)
    );
  }
}

export default SpecManager;
