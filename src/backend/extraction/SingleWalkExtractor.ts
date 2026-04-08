import type {
  FigmaNodeData,
  FigmaRestApiResponse,
  StyleTree,
} from "@frontend/ui/domain/code-generator2/types/types";

/**
 * 단일 walk 동안 공유되는 변경 가능한 누적자 모음.
 * deps / imageUrls / vectorSvgs는 "fill하면서 만드는" 결과물이고
 * visitedComponents / visitedImageHashes는 중복 작업 방지용 set.
 */
interface Accumulators {
  deps: Record<string, FigmaNodeData>;
  imageUrls: Record<string, string>;
  vectorSvgs: Record<string, string>;
  visitedComponents: Set<string>;
  visitedImageHashes: Set<string>;
}

const VECTOR_LIKE_TYPES: ReadonlySet<NodeType> = new Set<NodeType>([
  "VECTOR",
  "LINE",
  "STAR",
  "ELLIPSE",
  "POLYGON",
  "BOOLEAN_OPERATION",
]);

/**
 * SceneNode 한 그루를 단일 재귀 walk로 순회하면서
 * styleTree / dependencies / imageUrls / vectorSvgs를 동시 추출.
 *
 * 핵심 병렬화:
 * 1. 노드 단위: getCSSAsync + (선택적) vector export + (선택적) image bytes
 *    + (선택적) instance dependency 를 Promise.all로 동시 발사
 * 2. 자식 단위: Promise.all(children.map(walk))로 형제 노드 동시 walk
 *
 * 결과 4가지를 별도로 4번 트리 순회하던 기존 코드 대비
 * (구조적 추정으로) 차원 1·2 직렬화를 동시에 제거.
 */
export class SingleWalkExtractor {
  async extract(node: SceneNode): Promise<FigmaNodeData> {
    const acc: Accumulators = {
      deps: {},
      imageUrls: {},
      vectorSvgs: {},
      visitedComponents: new Set(),
      visitedImageHashes: new Set(),
    };

    // selectedNode의 JSON_REST_V1 export와 walk를 동시 발사.
    // exportAsync는 Figma 내부에서 자체 walk를 돌리므로 Promise 안에 fold할 수 없음 — 병렬 실행만 가능.
    const [info, styleTree] = await Promise.all([
      node.exportAsync({ format: "JSON_REST_V1" }) as Promise<FigmaRestApiResponse>,
      this.walk(node, acc),
    ]);

    return {
      pluginData: this.collectPluginData(node),
      info,
      styleTree,
      dependencies: Object.keys(acc.deps).length > 0 ? acc.deps : undefined,
      imageUrls: Object.keys(acc.imageUrls).length > 0 ? acc.imageUrls : undefined,
      vectorSvgs: Object.keys(acc.vectorSvgs).length > 0 ? acc.vectorSvgs : undefined,
    };
  }

  /**
   * 한 노드를 방문하면서 그 노드에 필요한 모든 비동기 작업을 동시 발사.
   * 자식들은 Promise.all(map)으로 병렬 walk.
   */
  private async walk(node: SceneNode, acc: Accumulators): Promise<StyleTree> {
    const cssPromise = this.getCssWithFixups(node);

    const sideTasks: Promise<void>[] = [];

    if (VECTOR_LIKE_TYPES.has(node.type)) {
      sideTasks.push(this.exportVectorSvg(node, acc));
    }

    if ("fills" in node && Array.isArray(node.fills)) {
      this.scheduleImageFills(node, acc, sideTasks);
    }

    if (node.type === "INSTANCE") {
      sideTasks.push(this.collectInstanceDependency(node, acc));
    }

    const childrenPromise: Promise<StyleTree[]> =
      "children" in node && node.children && node.children.length > 0
        ? Promise.all((node.children as readonly SceneNode[]).map((c) => this.walk(c, acc)))
        : Promise.resolve([]);

    // 모든 작업 동시 await — 핵심 병렬화 지점.
    // sideTasks는 fire-and-forget 효과만 필요하지만 Promise.all에 같이 넣어서
    // 에러 propagation을 일관되게 유지 (각 sideTask 안에서 try/catch는 별도로).
    const results = await Promise.all([cssPromise, childrenPromise, ...sideTasks]);
    const cssStyle = results[0] as Record<string, string>;
    const children = results[1] as StyleTree[];

    return {
      id: node.id,
      name: node.name,
      cssStyle,
      children,
    };
  }

  /**
   * getCSSAsync + 누락 속성 보충.
   * 보충 정책은 기존 FigmaPlugin._makeStyleTree (FigmaPlugin.ts:603-617)와 동일.
   * INSTANCE 등에서 getCSSAsync()가 opacity/overflow/blend-mode/rotation을 빠뜨리는 케이스 처리.
   */
  private async getCssWithFixups(node: SceneNode): Promise<Record<string, string>> {
    let cssStyle: Record<string, string>;
    try {
      cssStyle = await node.getCSSAsync();
    } catch {
      cssStyle = {};
    }

    if (
      !cssStyle.opacity &&
      "opacity" in node &&
      (node as unknown as { opacity: number }).opacity !== 1
    ) {
      cssStyle.opacity = String((node as unknown as { opacity: number }).opacity);
    }
    if (
      !cssStyle.overflow &&
      "clipsContent" in node &&
      (node as unknown as { clipsContent: boolean }).clipsContent === true
    ) {
      cssStyle.overflow = "hidden";
    }
    if (!cssStyle["mix-blend-mode"] && "blendMode" in node) {
      const bm = (node as unknown as { blendMode: BlendMode }).blendMode;
      if (bm && bm !== "PASS_THROUGH" && bm !== "NORMAL") {
        cssStyle["mix-blend-mode"] = bm.toLowerCase().replace(/_/g, "-");
      }
    }
    if (
      !cssStyle.transform &&
      "rotation" in node &&
      (node as unknown as { rotation: number }).rotation !== 0
    ) {
      cssStyle.transform = `rotate(${(node as unknown as { rotation: number }).rotation}deg)`;
    }

    return cssStyle;
  }

  private async exportVectorSvg(node: SceneNode, acc: Accumulators): Promise<void> {
    try {
      const svgBytes = await node.exportAsync({ format: "SVG" });
      acc.vectorSvgs[node.id] = String.fromCharCode(...svgBytes);
    } catch (e) {
      console.error(`Failed to export SVG: ${node.id}`, e);
    }
  }

  /**
   * fills 안의 IMAGE Paint를 찾아서 fetchImageBytes 작업을 sideTasks에 push.
   * 동기 dedup: visitedImageHashes에 즉시 추가해서 다른 walk가 같은 hash를 잡지 않도록.
   * (await 전에 set.add 하므로 다른 walk와 race 없음.)
   */
  private scheduleImageFills(
    node: SceneNode,
    acc: Accumulators,
    sideTasks: Promise<void>[],
  ): void {
    if (!("fills" in node) || !Array.isArray(node.fills)) return;
    for (const fill of node.fills as readonly Paint[]) {
      if (fill.type !== "IMAGE" || !fill.imageHash) continue;
      const hash = fill.imageHash;
      if (acc.visitedImageHashes.has(hash)) continue;
      acc.visitedImageHashes.add(hash);
      sideTasks.push(this.fetchImageBytes(hash, acc));
    }
  }

  private async fetchImageBytes(hash: string, acc: Accumulators): Promise<void> {
    try {
      const image = figma.getImageByHash(hash);
      if (!image) return;
      const bytes = await image.getBytesAsync();
      const base64 = figma.base64Encode(bytes);
      acc.imageUrls[hash] = `data:image/png;base64,${base64}`;
    } catch (e) {
      console.error(`Failed to get image: ${hash}`, e);
    }
  }

  /**
   * INSTANCE의 mainComponent를 찾아 dependency로 추가.
   * mainComponent를 같은 walker로 재귀 walk해서 그 styleTree까지 채움.
   *
   * 동기 체크-앤-마크: getMainComponentAsync await 직후, 다음 await 전에
   * visitedComponents 검사 + 추가. JS 단일 스레드라 atomic.
   */
  private async collectInstanceDependency(node: SceneNode, acc: Accumulators): Promise<void> {
    if (node.type !== "INSTANCE") return;
    try {
      const mainComponent = await (node as InstanceNode).getMainComponentAsync();
      if (!mainComponent) return;

      const componentId = mainComponent.id;
      if (acc.visitedComponents.has(componentId)) return;
      acc.visitedComponents.add(componentId);

      const [info, styleTree] = await Promise.all([
        mainComponent.exportAsync({ format: "JSON_REST_V1" }) as Promise<FigmaRestApiResponse>,
        this.walk(mainComponent as unknown as SceneNode, acc),
      ]);

      acc.deps[componentId] = {
        pluginData: [],
        info,
        styleTree,
      };
    } catch (e) {
      console.error("Failed to collect instance dependency", e);
    }
  }

  private collectPluginData(node: SceneNode): { key: string; value: string }[] {
    return node.getPluginDataKeys().map((key) => ({
      key,
      value: node.getPluginData(key),
    }));
  }
}
