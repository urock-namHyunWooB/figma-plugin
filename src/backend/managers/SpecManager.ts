import { extractVariantPatterns } from "../utils";
import { FigmaPlugin } from "../FigmaPlugin";
import type { ComponentStructureData } from "./ComponentStructureManager";
import type { LayoutTreeNode } from "./ComponentStructureManager";
import { BaseStyleProperties, NodeSpec } from "@backend";
import { ComponentSetNode } from "@figma/plugin-typings/plugin-api-standalone";
import { FigmaNodeData } from "@frontend/ui/domain/transpiler/types/figma-api";

/**
 * Component Set Node Spec 반환 타입
 * getComponentSetNodeSpec() 메서드의 반환 타입
 */
export interface ComponentSetNodeSpec extends NodeSpec {
  metadata: {
    name: string;
    rootElement: string;
    nodeType: ComponentSetNode["type"];
  };
  variantPatterns: Record<string, Record<string, unknown>>;
  componentsReferences: Array<{
    componentId: string;
    componentName: string;
    componentStructure: ComponentStructureData;
    layoutTree: LayoutTreeNode | null;
  }>;
}

class SpecManager {
  private figmaPlugin: FigmaPlugin;
  private metadataManager: FigmaPlugin["metadataManager"];

  constructor(
    figmaPlugin: FigmaPlugin,
    metadataManager: FigmaPlugin["metadataManager"]
  ) {
    this.figmaPlugin = figmaPlugin;
    this.metadataManager = metadataManager;
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

  /**
   * 단일 SceneNode 기준 스펙과 구조 정보 반환
   */

  //TODO NodeSpec return 타입으로 정의해야함.
  public async getNodeSpec(node: SceneNode): Promise<{
    spec: any;
    componentStructure: ComponentStructureData | null;
    layoutTree: LayoutTreeNode | null;
  }> {
    const spec = await this.buildNodeSpecTree(node);

    return {
      spec,
      componentStructure,
      layoutTree,
    };
  }

  public async getComponentSetNodeSpec(
    nodeData: FigmaNodeData
  ): Promise<ComponentSetNodeSpec> {
    const componentSetNode = nodeData.info.document as ComponentSetNode;
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
              componentSetNode.name
            ),
        };
      })
    );

    // 가장 자식이 많은 구조를 기본으로 선택
    // 이렇게 하면 iconLeft 같은 prop이 있는 완전한 variant를 기본으로 사용할 수 있음
    const componentStructure = this.findStructureWithMostChildren(
      componentStructures.map(({ structure }) => ({
        componentStructure: structure.componentStructure,
      }))
    );

    const layoutTree = componentStructure
      ? await this.componentStructureManager.extractStyleTree(
          componentStructure
        )
      : null;

    // 각 컴포넌트에 대한 componentStructure와 layoutTree 생성
    const componentsReferences = await Promise.all(
      componentStructures.map(async ({ component, structure }) => {
        const componentLayoutTree =
          await this.componentStructureManager.extractStyleTree(
            structure.componentStructure
          );

        return {
          componentId: component.id,
          componentName: component.name,
          componentStructure: structure.componentStructure,
          layoutTree: componentLayoutTree,
        };
      })
    );

    const propsDefinition = this.metadataManager.getCombinedPropsDefinition(
      componentSetNode as SceneNode
    );
    const internalStateDefinition =
      this.metadataManager.getInternalStateDefinition(
        componentSetNode as SceneNode
      );

    const elementBindings = this.metadataManager.getElementBindings(
      componentSetNode as SceneNode
    );

    const metadata = {
      name: componentSetNode.name,
      rootElement: this.inferRootElement(componentSetNode.name),
      nodeType: componentSetNode.type,
    };

    return {
      metadata,
      propsDefinition,
      internalStateDefinition,
      elementBindings,
      variantPatterns,
      componentStructure: componentStructure || null,
      layoutTree,
      componentsReferences,
      figmaInfo: nodeData,
    };
  }

  public async getComponentNodeSpec(componentNode: ComponentNode) {
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

    const spec: BaseStyleProperties & {
      children?: any[];
      name: string;
      id: string;
      styles: CSSStyleValue;
    } = {
      children,
      name: componentNode.name,
      id: componentNode.id,
      styles: await componentNode.getCSSAsync(),
    };

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
   * TODO 노드가 visible false 되어 있으면 없는 자식처리
   */
  private findStructureWithMostChildren(
    componentStructures: Array<{
      componentStructure: ComponentStructureData;
    }>
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
  private async buildNodeSpecTree(node: SceneNode): Promise<any | null> {
    if (node.type === "COMPONENT_SET") {
      return null;
    }

    const spec = await this.createNodeSpec(node);

    if (this.hasChildren(node)) {
      const childrenSpecs: any[] = [];

      for (const child of node.children) {
        if (child.type === "COMPONENT_SET") {
          continue;
        }

        const childSpec = await this.buildNodeSpecTree(child);
        if (childSpec) {
          childrenSpecs.push(childSpec);
        }
      }

      if (childrenSpecs.length > 0) {
        spec.children = childrenSpecs;
      }
    }

    return spec;
  }

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

  private async createNodeSpec(node: SceneNode): Promise<any> {
    switch (node.type) {
      case "COMPONENT":
        return this.getComponentNodeSpec(node);
      case "INSTANCE":
        return this.getInstanceNodeSpec(node);
      case "FRAME":
        return this.getFrameNodeSpec(node);
      case "TEXT":
        return this.getTextNodeSpec(node);
      case "RECTANGLE":
        return this.getRectangleNodeSpec(node);
      case "VECTOR":
        return this.getVectorNodeSpec(node);
      case "ELLIPSE":
        return this.getEllipseNodeSpec(node);
      case "STAR":
        return this.getStarNodeSpec(node);
      case "POLYGON":
        return this.getPolygonNodeSpec(node);
      default:
        return {
          id: node.id,
          name: node.name,
          type: node.type,
          visible: "visible" in node ? (node as any).visible : undefined,
          width: "width" in node ? (node as any).width : undefined,
          height: "height" in node ? (node as any).height : undefined,
        };
    }
  }

  private hasChildren(node: SceneNode): node is SceneNode & ChildrenMixin {
    return "children" in node && Array.isArray((node as any).children);
  }

  private async extractComponentStructureForNode(
    node: SceneNode
  ): Promise<ComponentStructureData | null> {
    const isSupportedForStructure =
      node.type === "FRAME" ||
      node.type === "GROUP" ||
      node.type === "COMPONENT" ||
      node.type === "INSTANCE";

    if (!isSupportedForStructure) {
      return null;
    }

    const { componentStructure } =
      await this.componentStructureManager.extractComponentStructure(
        node as FrameNode | GroupNode | ComponentNode | InstanceNode,
        node.name
      );

    return componentStructure;
  }
}

export default SpecManager;
