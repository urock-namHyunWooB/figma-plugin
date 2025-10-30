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

    // children이 있는 노드 타입들
    if (
      "children" in node &&
      Array.isArray(node.children) &&
      node.children.length > 0
    ) {
      element.children = node.children.map((child) =>
        this.extractNodeStructure(child)
      );
    }

    return element;
  }

  /**
   * ComponentSet의 전체 구조 데이터 추출
   */
  extractStructure(componentSet: ComponentSetNode): ComponentStructureData | null {
    const baseVariant = this.getBaseVariant(componentSet);
    if (!baseVariant) {
      return null;
    }

    const elements: StructureElement[] = baseVariant.children.map((child) =>
      this.extractNodeStructure(child)
    );

    return {
      baseVariantId: baseVariant.id,
      baseVariantName: baseVariant.name,
      elements,
      boundingBox: {
        width: baseVariant.width,
        height: baseVariant.height,
      },
    };
  }
}

