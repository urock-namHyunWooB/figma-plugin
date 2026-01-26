import type { FigmaNodeData, StyleTree } from "@compiler/types/baseType";
import type { PropsDef } from "@compiler/manager/PropsExtractor";

/**
 * 준비된 디자인 데이터
 *
 * DataPreparer가 원본 FigmaNodeData를 처리하여 생성하는 결과물
 * HashMap 기반 O(1) 조회와 정규화된 Props를 제공
 */
class PreparedDesignData {
  /** 원본 FigmaNodeData (깊은 복사본) */
  public readonly spec: FigmaNodeData;

  /** 루트 document 노드 */
  public readonly document: SceneNode;

  /** 스타일 트리 */
  public readonly styleTree: StyleTree;

  /** 노드 ID → SceneNode 매핑 (O(1) 조회) */
  public readonly nodeMap: Map<string, SceneNode>;

  /** 스타일 ID → StyleTree 매핑 (O(1) 조회) */
  public readonly styleMap: Map<string, StyleTree>;

  /** 추출된 Props 정의 */
  public readonly props: PropsDef;

  /** 의존성 맵 */
  public readonly dependencies: Map<string, FigmaNodeData>;

  /** 이미지 URL 맵 */
  public readonly imageUrls: Map<string, string>;

  /** Vector SVG 맵 */
  public readonly vectorSvgs: Map<string, string>;

  constructor(
    spec: FigmaNodeData,
    document: SceneNode,
    styleTree: StyleTree,
    nodeMap: Map<string, SceneNode>,
    styleMap: Map<string, StyleTree>,
    props: PropsDef,
    dependencies: Map<string, FigmaNodeData>,
    imageUrls: Map<string, string>,
    vectorSvgs: Map<string, string>
  ) {
    this.spec = spec;
    this.document = document;
    this.styleTree = styleTree;
    this.nodeMap = nodeMap;
    this.styleMap = styleMap;
    this.props = props;
    this.dependencies = dependencies;
    this.imageUrls = imageUrls;
    this.vectorSvgs = vectorSvgs;
  }

  /**
   * 노드 ID로 SceneNode 조회 (O(1))
   */
  public getNodeById(id: string): SceneNode | undefined {
    return this.nodeMap.get(id);
  }

  /**
   * 노드 ID로 StyleTree 조회 (O(1))
   */
  public getStyleById(id: string): StyleTree | undefined {
    const styleTree = this.styleMap.get(id);
    if (!styleTree) return styleTree;

    // 이미지 URL 교체가 필요한 경우
    if (
      styleTree.cssStyle &&
      this.imageUrls.size > 0
    ) {
      return this._replaceImagePlaceholders(id, styleTree);
    }

    return styleTree;
  }

  /**
   * 의존성 ID로 FigmaNodeData 조회 (O(1))
   */
  public getDependencyById(componentId: string): FigmaNodeData | undefined {
    return this.dependencies.get(componentId);
  }

  /**
   * 이미지 참조(imageRef)로 URL 조회 (O(1))
   */
  public getImageUrlByRef(imageRef: string): string | undefined {
    return this.imageUrls.get(imageRef);
  }

  /**
   * 노드 ID로 해당 노드의 imageRef 반환
   */
  public getImageRefByNodeId(nodeId: string): string | undefined {
    const node = this.nodeMap.get(nodeId);
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
   * 노드 ID로 SVG 문자열 반환
   */
  public getVectorSvgByNodeId(nodeId: string): string | undefined {
    return this.vectorSvgs.get(nodeId);
  }

  /**
   * componentPropertyDefinitions 반환
   */
  public getComponentPropertyDefinitions(): Record<string, unknown> | null {
    return "componentPropertyDefinitions" in this.document
      ? (this.document as any).componentPropertyDefinitions
      : null;
  }

  /**
   * componentProperties 반환
   */
  public getComponentProperties(): Record<string, unknown> | null {
    return "componentProperties" in this.document
      ? (this.document as any).componentProperties
      : null;
  }

  /**
   * 루트 노드 타입 반환
   */
  public getRootNodeType(): string {
    return this.document.type;
  }

  /**
   * styleTree의 <path-to-image> placeholder를 실제 이미지 URL로 교체
   */
  private _replaceImagePlaceholders(
    nodeId: string,
    styleTree: StyleTree
  ): StyleTree {
    const imageUrl = this.getImageUrlByNodeId(nodeId);
    if (!imageUrl) return styleTree;

    const cssStyle = { ...styleTree.cssStyle };

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
      ...styleTree,
      cssStyle,
    };
  }

  /**
   * INSTANCE ID로 첫 번째 매칭되는 Vector SVG를 반환
   */
  public getFirstVectorSvgByInstanceId(instanceId: string): string | undefined {
    const prefix = `I${instanceId};`;
    for (const [nodeId, svg] of this.vectorSvgs) {
      if (nodeId.startsWith(prefix)) {
        return svg;
      }
    }
    return undefined;
  }

  /**
   * INSTANCE 노드 ID로 해당 INSTANCE 내부의 모든 Vector SVG를 반환
   */
  public getVectorSvgsByInstanceId(
    instanceId: string
  ): { nodeId: string; svg: string; boundingBox?: any }[] {
    const result: { nodeId: string; svg: string; boundingBox?: any }[] = [];
    const prefix = `I${instanceId};`;

    for (const [nodeId, svg] of this.vectorSvgs) {
      if (nodeId.startsWith(prefix)) {
        const nodeSpec = this.nodeMap.get(nodeId);
        result.push({
          nodeId,
          svg,
          boundingBox: (nodeSpec as any)?.absoluteBoundingBox,
        });
      }
    }

    return result;
  }

  /**
   * INSTANCE 노드의 내부 Vector들을 하나의 SVG로 합성
   */
  public mergeInstanceVectorSvgs(instanceId: string): string | undefined {
    const vectors = this.getVectorSvgsByInstanceId(instanceId);
    if (vectors.length === 0) return undefined;

    const instanceSpec = this.nodeMap.get(instanceId);
    const instanceBox = (instanceSpec as any)?.absoluteBoundingBox;
    if (!instanceBox) return undefined;

    const { width: instWidth, height: instHeight, x: instX, y: instY } = instanceBox;

    const pathElements: string[] = [];

    for (const { svg, boundingBox } of vectors) {
      if (!boundingBox) continue;

      const pathMatch = svg.match(/<path[^>]*\/>/g);
      if (!pathMatch) continue;

      const relX = boundingBox.x - instX;
      const relY = boundingBox.y - instY;

      for (const path of pathMatch) {
        if (relX !== 0 || relY !== 0) {
          pathElements.push(
            `<g transform="translate(${relX}, ${relY})">${path}</g>`
          );
        } else {
          pathElements.push(path);
        }
      }
    }

    if (pathElements.length === 0) return undefined;

    return `<svg width="${instWidth}" height="${instHeight}" viewBox="0 0 ${instWidth} ${instHeight}" fill="none" xmlns="http://www.w3.org/2000/svg">${pathElements.join("")}</svg>`;
  }

  /**
   * dependencies를 componentSetId 기준으로 그룹핑
   */
  public getDependenciesGroupedByComponentSet(): Record<
    string,
    { componentSetName: string; variants: FigmaNodeData[] }
  > {
    if (this.dependencies.size === 0) return {};

    const groups: Record<
      string,
      { componentSetName: string; variants: FigmaNodeData[] }
    > = {};

    for (const [componentId, data] of this.dependencies) {
      const componentInfo = data.info.components?.[componentId] as any;
      const componentSetId = componentInfo?.componentSetId;

      if (componentSetId) {
        const componentSetInfo = data.info.componentSets?.[componentSetId] as any;
        const componentSetName = componentSetInfo?.name || "Unknown";

        if (!groups[componentSetId]) {
          groups[componentSetId] = {
            componentSetName,
            variants: [],
          };
        }
        groups[componentSetId].variants.push(data);
      } else {
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
}

export default PreparedDesignData;
