import { FigmaNodeData, StyleTree } from "../../types/types";

/** absoluteBoundingBox 구조 (Figma Plugin API) */
interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** absoluteBoundingBox를 가질 수 있는 노드 */
interface NodeWithBoundingBox {
  absoluteBoundingBox?: BoundingBox;
}

/** componentPropertyDefinitions/componentProperties를 가질 수 있는 노드 */
interface NodeWithComponentProps {
  componentPropertyDefinitions?: Record<string, unknown>;
  componentProperties?: Record<string, unknown>;
}

/** Figma component/componentSet info */
interface ComponentInfo {
  componentSetId?: string;
  name?: string;
}

class DataManager {
  /** 원본 FigmaNodeData (깊은 복사본) */
  private readonly spec: FigmaNodeData;

  /** 루트 document 노드 */
  private readonly document: SceneNode;

  /** 스타일 트리 */
  private readonly styleTree: StyleTree;

  /** 노드 ID → SceneNode 매핑 (O(1) 조회) */
  private readonly nodeMap: Map<string, SceneNode>;

  /** 스타일 ID → StyleTree 매핑 (O(1) 조회) */
  private readonly styleMap: Map<string, StyleTree>;

  /** 의존성 맵 */
  private readonly dependencies: Map<string, FigmaNodeData>;

  /** 이미지 URL 맵 */
  private readonly imageUrls: Map<string, string>;

  /** Vector SVG 맵 */
  private readonly vectorSvgs: Map<string, string>;

  /** 의존 컴포넌트별 병합된 Vector SVG (정규화) */
  private readonly dependencyMergedSvgs: Map<string, string>;

  constructor(spec: FigmaNodeData) {
    // 깊은 복사
    this.spec = JSON.parse(JSON.stringify(spec));

    // 데이터 추출
    this.document = this.spec.info.document;
    this.styleTree = this.spec.styleTree;

    // HashMap 구축
    this.nodeMap = this.buildNodeMap(this.document);
    this.styleMap = this.buildStyleMap(this.styleTree);
    this.dependencies = new Map();
    this.collectDependenciesRecursive(this.spec);
    this.imageUrls = this.buildRecordToMap(this.spec.imageUrls);
    this.vectorSvgs = this.buildRecordToMap(this.spec.vectorSvgs);

    // 데이터 정규화: INSTANCE Vector SVG를 의존 컴포넌트용으로 병합
    this.dependencyMergedSvgs = new Map();
    this.normalizeDependencyVectorSvgs();
  }

  /**
   * ID로 통합 조회 (O(1))
   * @param id - 조회할 ID
   * @returns node, style, spec 중 해당하는 것들 반환
   */
  public getById(id: string): {
    node?: SceneNode;
    style?: StyleTree;
    spec?: FigmaNodeData;
  } {
    const node = this.nodeMap.get(id);
    let style = this.styleMap.get(id);

    // 이미지 URL 교체
    if (style?.cssStyle && this.imageUrls.size > 0) {
      style = this.replaceImagePlaceholders(id, style);
    }

    // spec: 메인이면 this.spec, 의존이면 dependencies에서
    let spec: FigmaNodeData | undefined;
    if (id === this.document.id) {
      spec = this.spec;
    } else {
      spec = this.dependencies.get(id);
    }

    return { node, style, spec };
  }

  /**
   * 메인 컴포넌트 ID 반환
   * @returns spec의 루트 document ID
   */
  public getMainComponentId(): string {
    return this.document.id;
  }

  /**
   * 모든 의존성 반환 (재귀적으로 수집된)
   * @returns componentId → FigmaNodeData 매핑
   */
  public getAllDependencies(): Map<string, FigmaNodeData> {
    return this.dependencies;
  }

  /**
   * 이미지 참조(imageRef)로 URL 조회 (O(1))
   * @param imageRef - 이미지 참조 키
   * @returns 해당 참조의 이미지 URL, 없으면 undefined
   */
  public getImageUrlByRef(imageRef: string): string | undefined {
    return this.imageUrls.get(imageRef);
  }

  /**
   * 노드 ID로 해당 노드의 imageRef 반환
   * @param nodeId - 조회할 노드 ID
   * @returns 해당 노드의 이미지 참조, 없으면 undefined
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
   * @param nodeId - 조회할 노드 ID
   * @returns 해당 노드의 이미지 URL, 없으면 undefined
   */
  public getImageUrlByNodeId(nodeId: string): string | undefined {
    const imageRef = this.getImageRefByNodeId(nodeId);
    if (!imageRef) return undefined;
    return this.getImageUrlByRef(imageRef);
  }

  /**
   * 노드 ID로 SVG 문자열 반환
   * @param nodeId - 조회할 노드 ID
   * @returns 해당 노드의 SVG 문자열, 없으면 undefined
   */
  public getVectorSvgByNodeId(nodeId: string): string | undefined {
    return this.vectorSvgs.get(nodeId);
  }

  /**
   * INSTANCE 복합 경로의 마지막 세그먼트로 Vector SVG 매칭
   * vectorSvgs 키가 INSTANCE 경로 기반일 때 (예: I153:1214;55:1323;55:1327)
   * 마지막 세그먼트 (55:1327)로 매칭
   * @param nodeId - 조회할 노드 ID (원본 컴포넌트의 노드 ID)
   * @returns 매칭된 SVG 문자열, 없으면 undefined
   */
  public getVectorSvgByLastSegment(nodeId: string): string | undefined {
    // 정확한 매칭 먼저 시도
    const exact = this.vectorSvgs.get(nodeId);
    if (exact) return exact;

    // suffix 매칭 (;nodeId로 끝나는 키 찾기)
    const suffix = `;${nodeId}`;
    for (const [key, svg] of this.vectorSvgs) {
      if (key.endsWith(suffix)) {
        return svg;
      }
    }

    return undefined;
  }

  /**
   * componentPropertyDefinitions 반환
   * @returns componentPropertyDefinitions 객체, 없으면 null
   */
  public getComponentPropertyDefinitions(): Record<string, unknown> | null {
    const node = this.document as unknown as NodeWithComponentProps;
    return node.componentPropertyDefinitions ?? null;
  }

  /**
   * componentProperties 반환
   * @returns componentProperties 객체, 없으면 null
   */
  public getComponentProperties(): Record<string, unknown> | null {
    const node = this.document as unknown as NodeWithComponentProps;
    return node.componentProperties ?? null;
  }

  /**
   * 루트 document 노드 반환
   * @returns 루트 document SceneNode
   */
  public getDocument(): SceneNode {
    return this.document;
  }

  /**
   * 루트 노드 타입 반환
   * @returns 루트 document 노드의 타입 문자열
   */
  public getRootNodeType(): string {
    return this.document.type;
  }

  /**
   * 전체 variant 개수
   * @returns COMPONENT_SET이면 children 개수, 아니면 1
   */
  public get totalVariantCount(): number {
    if (this.document.type === "COMPONENT_SET") {
      const children = (this.document as any).children as SceneNode[] | undefined;
      return children?.length || 1;
    }
    return 1;
  }

  /**
   * styleTree의 <path-to-image> placeholder를 실제 이미지 URL로 교체
   * @param nodeId - 노드 ID
   * @param styleTree - 원본 StyleTree
   * @returns 이미지 URL이 치환된 StyleTree
   */
  private replaceImagePlaceholders(
    nodeId: string,
    styleTree: StyleTree
  ): StyleTree {
    const imageUrl = this.getImageUrlByNodeId(nodeId);
    if (!imageUrl) return styleTree;

    const cssStyle = { ...styleTree.cssStyle };

    // background 속성에서 <path-to-image> 교체
    if (
      cssStyle.background &&
      cssStyle.background.includes("<path-to-image>")
    ) {
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
   * document 트리 순회 → nodeMap 구축
   * @param document - 루트 SceneNode
   * @returns 노드 ID → SceneNode 매핑
   */
  private buildNodeMap(document: SceneNode): Map<string, SceneNode> {
    const map = new Map<string, SceneNode>();
    const traverse = (node: SceneNode) => {
      map.set(node.id, node);
      if ("children" in node && node.children) {
        for (const child of node.children) {
          traverse(child as SceneNode);
        }
      }
    };
    traverse(document);
    return map;
  }

  /**
   * styleTree 순회 → styleMap 구축
   * @param styleTree - 루트 StyleTree
   * @returns 노드 ID → StyleTree 매핑
   */
  private buildStyleMap(styleTree: StyleTree): Map<string, StyleTree> {
    const map = new Map<string, StyleTree>();
    const traverse = (tree: StyleTree) => {
      map.set(tree.id, tree);
      if ("children" in tree && tree.children) {
        for (const child of tree.children) {
          traverse(child);
        }
      }
    };
    traverse(styleTree);
    return map;
  }

  /**
   * 모든 의존성을 재귀적으로 수집
   * componentId 기준 중복 제거
   * @param spec - FigmaNodeData
   */
  private collectDependenciesRecursive(spec: FigmaNodeData): void {
    if (!spec.dependencies) return;

    for (const [componentId, depSpec] of Object.entries(spec.dependencies)) {
      // 중복 체크 (componentId 기준)
      if (!this.dependencies.has(componentId)) {
        this.dependencies.set(componentId, depSpec);

        // dependency의 styleTree도 styleMap에 추가
        if (depSpec.styleTree) {
          this.addToStyleMap(depSpec.styleTree);
        }

        // dependency의 document 노드들도 nodeMap에 추가
        // INSTANCE 노드 내부의 componentId 조회에 필요
        if (depSpec.info?.document) {
          this.addToNodeMap(depSpec.info.document);
        }

        // 깊이 있는 의존성도 수집
        this.collectDependenciesRecursive(depSpec);
      }
    }
  }

  /**
   * 노드를 nodeMap에 재귀적으로 추가
   */
  private addToNodeMap(node: SceneNode): void {
    this.nodeMap.set(node.id, node);
    if ("children" in node && node.children) {
      for (const child of node.children) {
        this.addToNodeMap(child as SceneNode);
      }
    }
  }

  /**
   * styleTree를 styleMap에 재귀적으로 추가
   */
  private addToStyleMap(tree: StyleTree): void {
    this.styleMap.set(tree.id, tree);
    if (tree.children) {
      for (const child of tree.children) {
        this.addToStyleMap(child);
      }
    }
  }

  /**
   * Record → Map 변환
   * @param record - Record 객체 (optional)
   * @returns Map 객체
   */
  private buildRecordToMap<T>(record?: Record<string, T>): Map<string, T> {
    const map = new Map<string, T>();
    if (!record) return map;
    for (const [key, value] of Object.entries(record)) {
      map.set(key, value);
    }
    return map;
  }

  /**
   * INSTANCE ID로 첫 번째 매칭되는 Vector SVG를 반환
   * @param instanceId - INSTANCE 노드 ID
   * @returns 첫 번째 매칭된 SVG 문자열, 없으면 undefined
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
   * @param instanceId - INSTANCE 노드 ID
   * @returns 내부 Vector SVG 정보 배열 (nodeId, svg, boundingBox)
   */
  public getVectorSvgsByInstanceId(
    instanceId: string
  ): { nodeId: string; svg: string; boundingBox?: BoundingBox }[] {
    const result: { nodeId: string; svg: string; boundingBox?: BoundingBox }[] = [];
    const prefix = `I${instanceId};`;

    for (const [nodeId, svg] of this.vectorSvgs) {
      if (nodeId.startsWith(prefix)) {
        const nodeSpec = this.nodeMap.get(nodeId) as unknown as NodeWithBoundingBox | undefined;
        result.push({
          nodeId,
          svg,
          boundingBox: nodeSpec?.absoluteBoundingBox,
        });
      }
    }

    return result;
  }

  /**
   * INSTANCE 노드의 내부 Vector들을 하나의 SVG로 합성
   * @param instanceId - INSTANCE 노드 ID
   * @returns 합성된 SVG 문자열, 없으면 undefined
   */
  public mergeInstanceVectorSvgs(instanceId: string): string | undefined {
    const vectors = this.getVectorSvgsByInstanceId(instanceId);
    if (vectors.length === 0) return undefined;

    const instanceSpec = this.nodeMap.get(instanceId) as unknown as NodeWithBoundingBox | undefined;
    const instanceBox = instanceSpec?.absoluteBoundingBox;
    if (!instanceBox) return undefined;

    const {
      width: instWidth,
      height: instHeight,
      x: instX,
      y: instY,
    } = instanceBox;

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
   * @returns componentSetId를 키로 하는 그룹핑된 의존성 정보
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
      const componentInfo = data.info.components?.[componentId] as ComponentInfo | undefined;
      const componentSetId = componentInfo?.componentSetId;

      if (componentSetId) {
        const componentSetInfo = data.info.componentSets?.[
          componentSetId
        ] as ComponentInfo | undefined;
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

  /**
   * 의존 컴포넌트용 병합된 Vector SVG 반환 (정규화된 데이터)
   * @param componentId - 의존 컴포넌트 ID
   * @returns 병합된 SVG 문자열, 없으면 undefined
   */
  public getMergedVectorSvgForComponent(componentId: string): string | undefined {
    return this.dependencyMergedSvgs.get(componentId);
  }

  /**
   * INSTANCE Vector SVG를 의존 컴포넌트용으로 정규화
   * 메인 트리의 INSTANCE 노드를 스캔하여 각 의존 컴포넌트에 대한 병합된 SVG 생성
   */
  private normalizeDependencyVectorSvgs(): void {
    // 메인 트리 INSTANCE 노드 스캔
    this.scanInstanceNodes(this.document);
  }

  /**
   * 노드 트리를 순회하며 INSTANCE 노드 찾기
   */
  private scanInstanceNodes(node: SceneNode): void {
    // INSTANCE 노드 감지
    if (node.type === "INSTANCE") {
      const instanceNode = node as any;
      const componentId = instanceNode.componentId;

      if (componentId && this.dependencies.has(componentId)) {
        // 이미 병합된 SVG가 있으면 스킵 (첫 번째 INSTANCE만 사용)
        if (!this.dependencyMergedSvgs.has(componentId)) {
          const mergedSvg = this.mergeInstanceVectorSvgs(node.id);
          if (mergedSvg) {
            this.dependencyMergedSvgs.set(componentId, mergedSvg);
          }
        }
      }
    }

    // 자식 노드 재귀
    if ("children" in node && node.children) {
      for (const child of node.children) {
        this.scanInstanceNodes(child as SceneNode);
      }
    }
  }
}

export default DataManager;
