import { StyleExtractor, ExtractedStyles } from "../extractors/StyleExtractor";
import { BaseStyleProperties, Padding } from "../types/styles";

/**
 * Component Structure 관리 클래스
 * 단일 책임: ComponentSet의 구조 추출
 */

export interface StructureElement {
  id: string;
  name: string;
  type: string;
  children?: StructureElement[];
}

export interface ComponentStructureData {
  root: StructureElement;
}

/**
 * Layout Tree 노드 타입
 */
export interface LayoutTreeNode extends BaseStyleProperties {
  id: string;
  width: number;
  height: number;
  children: LayoutTreeNode[];
}

export class ComponentStructureManager {
  private styleExtractor: StyleExtractor;

  constructor() {
    this.styleExtractor = new StyleExtractor();
  }

  public async extractStyleTree(componentStructure: ComponentStructureData) {
    const root = componentStructure.root;

    const rootNode = await figma.getNodeByIdAsync(root.id);

    if (!rootNode || rootNode.type === "DOCUMENT" || rootNode.type === "PAGE") {
      return null;
    }

    const sceneNode = rootNode as SceneNode;
    const layoutTree = await this.extractLayoutNodeRecursive(root, sceneNode);

    return layoutTree;
  }

  public async extractComponentStructure(
    Node: FrameNode | GroupNode | ComponentNode | InstanceNode,
    componentSetName: string,
  ): Promise<{ componentStructure: ComponentStructureData }> {
    const rootElementName = this.inferRootElement(componentSetName);

    // 노드 구조 추출 (재귀적으로 children 포함)
    const rootElement = this.extractNodeStructureRecursive(Node);

    // 추론된 root element 이름으로 업데이트
    rootElement.name = rootElementName;

    return {
      componentStructure: {
        root: rootElement,
      },
    };
  }

  /**
   * variant별 스타일 매핑 추출
   * 각 variant 속성 값별로 공통되는 스타일 정보를 추출
   */
  public extractVariantStyles(
    componentSet: ComponentSetNode,
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
   * 노드의 구조를 재귀적으로 추출
   */
  private extractNodeStructure(node: SceneNode): StructureElement {
    const element: StructureElement = {
      id: node.id,
      name: node.name,
      type: node.type,
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
    }

    return element;
  }

  /**
   * 노드와 그 children을 재귀적으로 추출
   */
  private extractNodeStructureRecursive(node: SceneNode): StructureElement {
    const element = this.extractNodeStructure(node);

    // children이 있는 경우 재귀적으로 추출
    if ("children" in node && Array.isArray(node.children)) {
      element.children = node.children.map((child) =>
        this.extractNodeStructureRecursive(child),
      );
    }

    return element;
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
    propertyDefinitions: ComponentPropertyDefinitions,
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
              v.variantProperties[propName] === optionValue,
          );

          if (matchingVariants.length > 0) {
            // 이 옵션에서 공통적으로 나타나는 스타일 찾기
            const commonStyles = this.findCommonStyles(
              matchingVariants.map((v) => v.styles),
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
              v.variantProperties &&
              v.variantProperties[propName] === boolValue,
          );

          if (matchingVariants.length > 0) {
            const commonStyles = this.findCommonStyles(
              matchingVariants.map((v) => v.styles),
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

  /**
   * 컴포넌트 이름으로부터 root 요소 추론
   */
  private inferRootElement(componentName: string): string {
    const lowerName = componentName.toLowerCase();

    if (lowerName.includes("button")) return "button";
    if (lowerName.includes("input")) return "input";
    if (lowerName.includes("checkbox")) return "input[type=checkbox]";
    if (lowerName.includes("radio")) return "input[type=radio]";
    if (lowerName.includes("select")) return "select";
    if (lowerName.includes("textarea")) return "textarea";
    if (lowerName.includes("link")) return "a";
    if (lowerName.includes("heading") || lowerName.includes("title"))
      return "h2";
    if (lowerName.includes("card")) return "article";
    if (lowerName.includes("modal") || lowerName.includes("dialog"))
      return "dialog";

    return "div";
  }

  /**
   * 배열에서 가장 많이 나타나는 값 찾기
   */
  private findMostCommon<T extends string | number>(arr: T[]): T {
    if (arr.length === 0) return "unknown" as T;

    const counts = new Map<T, number>();
    arr.forEach((item) => {
      counts.set(item, (counts.get(item) || 0) + 1);
    });

    let maxCount = 0;
    let mostCommon = arr[0];
    counts.forEach((count, item) => {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = item;
      }
    });

    return mostCommon;
  }

  /**
   * child의 이름과 타입으로 역할 추론
   */
  private inferChildRoleByName(name: string, type: string): string {
    const lowerName = name.toLowerCase();

    // 이름 기반 매칭
    if (lowerName.includes("icon")) return "icon";
    if (
      lowerName.includes("label") ||
      lowerName.includes("text") ||
      lowerName.includes("button")
    )
      return "label";
    if (lowerName.includes("background") || lowerName.includes("bg"))
      return "background";
    if (lowerName.includes("container")) return "container";
    if (lowerName.includes("secondary")) return "label";

    // 타입 기반 매칭
    if (type === "TEXT") return "label";
    if (type === "INSTANCE") return lowerName || "element";

    return lowerName || "unknown";
  }

  /**
   * 노드의 레이아웃 정보를 재귀적으로 추출
   */
  private async extractLayoutNodeRecursive(
    structureElement: StructureElement,
    node: SceneNode,
    parentNode?: SceneNode,
    parentPadding?: Padding,
  ): Promise<LayoutTreeNode> {
    // StyleExtractor를 사용하여 스타일 정보 추출
    const extractedStyles = this.styleExtractor.extractStyles(
      node,
      parentNode,
      parentPadding,
    );

    const layoutNode: LayoutTreeNode = {
      id: structureElement.id,
      width: "width" in node ? node.width : 0,
      height: "height" in node ? node.height : 0,
      ...extractedStyles,
      children: [],
    };

    // children 재귀적으로 추출
    if (structureElement.children && structureElement.children.length > 0) {
      const childrenNodes = await Promise.all(
        structureElement.children.map((childElement) =>
          this.extractChildNode(childElement, node, extractedStyles.padding),
        ),
      );

      layoutNode.children = childrenNodes.filter(
        (child): child is LayoutTreeNode => child !== null,
      );
    }

    return layoutNode;
  }

  /**
   * 자식 노드 추출 (헬퍼 메서드)
   */
  private async extractChildNode(
    childElement: StructureElement,
    parentNode: SceneNode,
    parentPadding?: Padding,
  ): Promise<LayoutTreeNode | null> {
    const childNode = await figma.getNodeByIdAsync(childElement.id);

    if (
      !childNode ||
      childNode.type === "DOCUMENT" ||
      childNode.type === "PAGE"
    ) {
      return null;
    }

    return this.extractLayoutNodeRecursive(
      childElement,
      childNode as SceneNode,
      parentNode,
      parentPadding,
    );
  }
}
