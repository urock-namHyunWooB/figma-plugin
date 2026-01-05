import { FigmaNodeData, StyleTree } from "@compiler";
import { RenderTree } from "@frontend/ui/domain/compiler/types/customType";

class SpecDataManager {
  private spec: FigmaNodeData;
  private specHashMap: Record<string, FigmaNodeData["info"]["document"]> = {};

  private renderTreeHashMap: Record<string, RenderTree> = {};

  private document: SceneNode;

  constructor(spec: FigmaNodeData) {
    this.spec = spec;

    this.document = spec.info.document;

    this.recursiveAddSpec(spec.info.document);
    this.recursiveAddRenderTree(spec.styleTree);
  }

  public getDocument() {
    return this.document;
  }

  /**
   * 전체 FigmaNodeData 반환
   */
  public getSpec(): FigmaNodeData {
    return this.spec;
  }

  public getSpecById(id: string) {
    return this.specHashMap[id];
  }

  public getRenderTree(): RenderTree {
    return this.spec.styleTree!;
  }

  public getRenderTreeById(id: string): RenderTree {
    const renderTree = this.renderTreeHashMap[id]!;
    if (!renderTree) return renderTree;

    // 이미지 URL 교체가 필요한 경우
    if (
      renderTree.cssStyle &&
      this.spec.imageUrls &&
      Object.keys(this.spec.imageUrls).length > 0
    ) {
      return this._replaceImagePlaceholders(id, renderTree);
    }

    return renderTree;
  }

  /**
   * styleTree의 <path-to-image> placeholder를 실제 이미지 URL로 교체
   */
  private _replaceImagePlaceholders(
    nodeId: string,
    renderTree: RenderTree
  ): RenderTree {
    const imageUrl = this.getImageUrlByNodeId(nodeId);
    if (!imageUrl) return renderTree;

    const cssStyle = { ...renderTree.cssStyle };

    // background 속성에서 <path-to-image> 교체
    if (cssStyle.background && cssStyle.background.includes("<path-to-image>")) {
      cssStyle.background = cssStyle.background.replace(
        "<path-to-image>",
        imageUrl
      );
    }

    // background-image 속성도 체크
    if (
      cssStyle["background-image"] &&
      cssStyle["background-image"].includes("<path-to-image>")
    ) {
      cssStyle["background-image"] = cssStyle["background-image"].replace(
        "<path-to-image>",
        imageUrl
      );
    }

    return {
      ...renderTree,
      cssStyle,
    };
  }

  public getComponentPropertyDefinitions() {
    return "componentPropertyDefinitions" in this.spec.info.document
      ? this.spec.info.document.componentPropertyDefinitions
      : null;
  }

  /**
   * INSTANCE 노드의 componentProperties를 반환합니다.
   * componentPropertyDefinitions와 다른 형식이므로 변환이 필요합니다.
   */
  public getComponentProperties() {
    return "componentProperties" in this.spec.info.document
      ? this.spec.info.document.componentProperties
      : null;
  }

  /**
   * 노드 타입을 반환합니다.
   */
  public getRootNodeType(): string {
    return this.spec.info.document.type;
  }

  /**
   * INSTANCE 노드가 참조하는 원본 컴포넌트 데이터를 반환합니다.
   */
  public getDependencies(): Record<string, FigmaNodeData> | undefined {
    return this.spec.dependencies;
  }

  /**
   * componentId로 원본 컴포넌트 데이터를 가져옵니다.
   */
  public getDependencyById(componentId: string): FigmaNodeData | undefined {
    return this.spec.dependencies?.[componentId];
  }

  /**
   * 이미지 URL 맵 반환
   */
  public getImageUrls(): Record<string, string> {
    return this.spec.imageUrls || {};
  }

  /**
   * imageRef로 이미지 URL 반환
   */
  public getImageUrlByRef(imageRef: string): string | undefined {
    return this.spec.imageUrls?.[imageRef];
  }

  /**
   * 노드 ID로 해당 노드의 imageRef 반환 (fills에서 찾음)
   */
  public getImageRefByNodeId(nodeId: string): string | undefined {
    const node = this.specHashMap[nodeId];
    if (!node) return undefined;

    // fills에서 이미지 찾기
    if ("fills" in node && Array.isArray(node.fills)) {
      for (const fill of node.fills) {
        if (fill.type === "IMAGE" && fill.imageRef) {
          return fill.imageRef;
        }
      }
    }
    return undefined;
  }

  /**
   * 노드 ID로 실제 이미지 URL 반환
   */
  public getImageUrlByNodeId(nodeId: string): string | undefined {
    const imageRef = this.getImageRefByNodeId(nodeId);
    if (!imageRef) return undefined;
    return this.getImageUrlByRef(imageRef);
  }

  /**
   * VECTOR SVG 맵 반환
   */
  public getVectorSvgs(): Record<string, string> {
    return this.spec.vectorSvgs || {};
  }

  /**
   * 노드 ID로 SVG 문자열 반환
   */
  public getVectorSvgByNodeId(nodeId: string): string | undefined {
    return this.spec.vectorSvgs?.[nodeId];
  }

  /**
   * dependencies를 componentSetId 기준으로 그룹핑합니다.
   * 같은 ComponentSet의 variants는 하나의 React 컴포넌트로 컴파일됩니다.
   */
  public getDependenciesGroupedByComponentSet(): Record<
    string,
    { componentSetName: string; variants: FigmaNodeData[] }
  > {
    const dependencies = this.spec.dependencies;
    if (!dependencies) return {};

    const groups: Record<
      string,
      { componentSetName: string; variants: FigmaNodeData[] }
    > = {};

    for (const [componentId, data] of Object.entries(dependencies)) {
      // components 맵에서 componentSetId 찾기
      const componentInfo = data.info.components?.[componentId];
      const componentSetId = componentInfo?.componentSetId;

      if (componentSetId) {
        // componentSets 맵에서 이름 가져오기
        const componentSetInfo = data.info.componentSets?.[componentSetId];
        const componentSetName = componentSetInfo?.name || "Unknown";

        if (!groups[componentSetId]) {
          groups[componentSetId] = {
            componentSetName,
            variants: [],
          };
        }
        groups[componentSetId].variants.push(data);
      } else {
        // componentSetId가 없는 경우 (단일 컴포넌트)
        // componentId를 키로 사용
        if (!groups[componentId]) {
          groups[componentId] = {
            componentSetName: data.info.document.name,
            variants: [data],
          };
        }
      }
    }

    return groups;
  }

  private recursiveAddSpec(node: FigmaNodeData["info"]["document"]) {
    this.specHashMap[node.id] = node;

    if ("children" in node && node.children) {
      node.children.forEach((child) => {
        this.recursiveAddSpec(child);
      });
    }
  }

  private recursiveAddRenderTree(renderTree: StyleTree) {
    this.renderTreeHashMap[renderTree.id] = renderTree;

    if ("children" in renderTree && renderTree.children) {
      renderTree.children.forEach((child) => {
        this.recursiveAddRenderTree(child);
      });
    }
  }
}

export default SpecDataManager;
