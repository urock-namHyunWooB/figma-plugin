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
  metrics: ExtractMetrics;
  cssCache: StyleHashCache;
  /**
   * INSTANCE node id → mainComponent id 맵. JSON_REST_V1 결과에서 미리 수집.
   * collectInstanceDependency가 getMainComponentAsync 호출 **전에** dedup 판정 가능.
   * dep walk에서 새 info 수집할 때마다 mergeInstanceMap으로 추가.
   */
  instanceToComponentId: Map<string, string>;
}

/**
 * 임시 계측용 누적자. extract() 1회당 1개 생성, 끝에서 console.log로 덤프.
 * TODO(cleanup): 최적화 ROI 확정 후 제거.
 */
interface ExtractMetrics {
  getCSS: PhaseStats;
  cssCacheHit: number;
  cssCacheMiss: number;
  exportSVG: PhaseStats;
  exportJSON: PhaseStats;
  getMainComponent: PhaseStats;
  getImageBytes: PhaseStats;
  /** instanceToComponentId 맵 진단 */
  instanceMapSize: number;
  instanceMapHit: number;
  instanceMapMiss: number;
  /** 샘플 로그: 처음 5개 INSTANCE의 id vs 맵 내 샘플 id */
  instanceIdSamples: string[];
  mapIdSamples: string[];
}
interface PhaseStats {
  count: number;
  ms: number;
}

/**
 * getCSSAsync 호출을 노드의 style-affecting 속성 해시 기준으로 dedup.
 * 같은 hash의 동시 요청도 pending Promise를 공유해서 중복 bridge 호출 0.
 *
 * 안전성:
 * - hash 입력은 getCSSAsync 결과에 영향 주는 속성만 포함 (보수적).
 * - TEXT 노드는 mixed style 복잡도 때문에 node.id를 hash에 포함 → dedup skip.
 * - 속성 접근 중 예외 발생 시 null hash 반환 → cache bypass.
 */
class StyleHashCache {
  private readonly cache = new Map<string, Promise<Record<string, string>>>();

  async get(
    node: SceneNode,
    compute: () => Promise<Record<string, string>>,
    onHit: () => void,
    onMiss: () => void,
  ): Promise<Record<string, string>> {
    const key = this.hashNode(node);
    if (key !== null) {
      const cached = this.cache.get(key);
      if (cached) {
        onHit();
        return cached;
      }
    }
    onMiss();
    const promise = compute();
    if (key !== null) this.cache.set(key, promise);
    return promise;
  }

  /**
   * null 반환 = "캐시 불가" (TEXT mixed, property 접근 실패 등) → 매번 새로 호출.
   */
  private hashNode(node: SceneNode): string | null {
    // TEXT는 characterStyleOverrides / mixed 문제로 일단 dedup 제외.
    if (node.type === "TEXT") return null;

    try {
      const parts: string[] = [node.type];

      for (const k of SCALAR_STYLE_KEYS) {
        if (k in node) {
          const v = (node as unknown as Record<string, unknown>)[k];
          if (typeof v === "symbol") return null; // figma.mixed
          parts.push(`${k}=${String(v)}`);
        }
      }
      for (const k of OBJECT_STYLE_KEYS) {
        if (k in node) {
          const v = (node as unknown as Record<string, unknown>)[k];
          if (typeof v === "symbol") return null;
          parts.push(`${k}=${JSON.stringify(v)}`);
        }
      }

      // FNV-1a 32bit
      const s = parts.join("|");
      let h = 0x811c9dc5;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      return (h >>> 0).toString(16);
    } catch {
      return null;
    }
  }
}

const SCALAR_STYLE_KEYS = [
  "opacity",
  "rotation",
  "clipsContent",
  "blendMode",
  "visible",
  "cornerRadius",
  "cornerSmoothing",
  "paddingTop",
  "paddingBottom",
  "paddingLeft",
  "paddingRight",
  "itemSpacing",
  "counterAxisSpacing",
  "layoutMode",
  "layoutWrap",
  "primaryAxisAlignItems",
  "counterAxisAlignItems",
  "primaryAxisSizingMode",
  "counterAxisSizingMode",
  "layoutSizingHorizontal",
  "layoutSizingVertical",
  "layoutAlign",
  "layoutGrow",
  "layoutPositioning",
  "minWidth",
  "maxWidth",
  "minHeight",
  "maxHeight",
  "strokeWeight",
  "strokeAlign",
  "strokeCap",
  "strokeJoin",
  "strokeMiterLimit",
  "width",
  "height",
] as const;

const OBJECT_STYLE_KEYS = [
  "fills",
  "strokes",
  "effects",
  "individualStrokeWeights",
  "rectangleCornerRadii",
  "constraints",
  "dashPattern",
  "backgrounds",
] as const;

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
    const metrics: ExtractMetrics = {
      getCSS: { count: 0, ms: 0 },
      cssCacheHit: 0,
      cssCacheMiss: 0,
      exportSVG: { count: 0, ms: 0 },
      exportJSON: { count: 0, ms: 0 },
      getMainComponent: { count: 0, ms: 0 },
      getImageBytes: { count: 0, ms: 0 },
      instanceMapSize: 0,
      instanceMapHit: 0,
      instanceMapMiss: 0,
      instanceIdSamples: [],
      mapIdSamples: [],
    };
    const acc: Accumulators = {
      deps: {},
      imageUrls: {},
      vectorSvgs: {},
      visitedComponents: new Set(),
      visitedImageHashes: new Set(),
      metrics,
      cssCache: new StyleHashCache(),
      instanceToComponentId: new Map(),
    };

    const totalStart = Date.now();

    // JSON_REST_V1을 먼저 가져와서 instance→componentId 맵을 구성해야
    // walk 도중 getMainComponentAsync를 대거 skip할 수 있다.
    // 병렬성 손실은 exportAsync(JSON_REST) top-level 1회 비용(보통 수백 ms 이하)
    // vs getMainComponentAsync 수천 회 절감 이득 — 후자가 압도적.
    const info = await this.timedExportJson(node, metrics);
    this.mergeInstanceMap(info, acc.instanceToComponentId);
    // 진단: 맵 사이즈 + 샘플 5개 기록
    metrics.instanceMapSize = acc.instanceToComponentId.size;
    let i = 0;
    for (const [k, v] of acc.instanceToComponentId) {
      if (i++ >= 5) break;
      metrics.mapIdSamples.push(`${k} → ${v}`);
    }
    const styleTree = await this.walk(node, acc);

    const result = {
      pluginData: this.collectPluginData(node),
      info,
      styleTree,
      dependencies: Object.keys(acc.deps).length > 0 ? acc.deps : undefined,
      imageUrls: Object.keys(acc.imageUrls).length > 0 ? acc.imageUrls : undefined,
      vectorSvgs: Object.keys(acc.vectorSvgs).length > 0 ? acc.vectorSvgs : undefined,
    };

    const totalMs = Date.now() - totalStart;
    const dedup = this.simulateDedup(info, acc);
    this.reportMetrics(node, totalMs, metrics, dedup);

    return result;
  }

  /**
   * 한 노드를 방문하면서 그 노드에 필요한 모든 비동기 작업을 동시 발사.
   * 자식들은 Promise.all(map)으로 병렬 walk.
   */
  private async walk(node: SceneNode, acc: Accumulators): Promise<StyleTree> {
    const cssPromise = this.getCssWithFixups(node, acc);

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
   * getCSSAsync + 누락 속성 보충 (hash-dedup 경유).
   * 해시 입력에 opacity/clipsContent/blendMode/rotation이 포함돼 있으므로
   * 같은 hash의 노드는 fixup 결과도 동일 → compute 안에 fixup을 둬도 안전.
   *
   * cache hit 시 공유된 frozen object 반환 → shallow copy로 mutation 차단.
   */
  private async getCssWithFixups(
    node: SceneNode,
    acc: Accumulators,
  ): Promise<Record<string, string>> {
    const cached = await acc.cssCache.get(
      node,
      () => this.computeCssWithFixups(node, acc.metrics),
      () => {
        acc.metrics.cssCacheHit += 1;
      },
      () => {
        acc.metrics.cssCacheMiss += 1;
      },
    );
    return { ...cached };
  }

  private async computeCssWithFixups(
    node: SceneNode,
    metrics: ExtractMetrics,
  ): Promise<Record<string, string>> {
    let cssStyle: Record<string, string>;
    try {
      const t0 = Date.now();
      cssStyle = await node.getCSSAsync();
      metrics.getCSS.ms += Date.now() - t0;
      metrics.getCSS.count += 1;
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
      const t0 = Date.now();
      const svgBytes = await node.exportAsync({ format: "SVG" });
      acc.metrics.exportSVG.ms += Date.now() - t0;
      acc.metrics.exportSVG.count += 1;
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
      const t0 = Date.now();
      const bytes = await image.getBytesAsync();
      acc.metrics.getImageBytes.ms += Date.now() - t0;
      acc.metrics.getImageBytes.count += 1;
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
      // Fast path: instanceToComponentId 맵 hit + 이미 방문한 componentId면
      // getMainComponentAsync 호출 없이 즉시 종료.
      const mappedId = acc.instanceToComponentId.get(node.id);
      // 진단: 처음 5개 INSTANCE의 id 샘플 저장
      if (acc.metrics.instanceIdSamples.length < 5) {
        acc.metrics.instanceIdSamples.push(
          `${node.id} → map=${mappedId ?? "MISS"}`,
        );
      }

      // Race-free claim: has/add가 같은 sync block 안이면 atomic (JS single-thread).
      // mappedId가 있으면 getMainComponentAsync 호출 전에 미리 claim해서
      // 같은 componentId의 다른 INSTANCE들이 병렬 walk에서 skip하게 함.
      if (mappedId !== undefined) {
        acc.metrics.instanceMapHit += 1;
        if (acc.visitedComponents.has(mappedId)) {
          return;
        }
        acc.visitedComponents.add(mappedId);
      } else {
        acc.metrics.instanceMapMiss += 1;
      }

      const t0 = Date.now();
      const mainComponent = await (node as InstanceNode).getMainComponentAsync();
      acc.metrics.getMainComponent.ms += Date.now() - t0;
      acc.metrics.getMainComponent.count += 1;
      if (!mainComponent) return;

      const componentId = mainComponent.id;
      if (mappedId === undefined) {
        // Fallback 경로(map miss): 기존처럼 post-check dedup.
        if (acc.visitedComponents.has(componentId)) return;
        acc.visitedComponents.add(componentId);
      } else if (componentId !== mappedId) {
        // 방어: mappedId와 실제 id가 다르면(가설: componentSet 내 variant 차이 등)
        // 실제 id도 visited에 기록해서 다음 fallback 경로에서 중복 안 만들게.
        if (!acc.visitedComponents.has(componentId)) {
          acc.visitedComponents.add(componentId);
        }
      }

      const [info, styleTree] = await Promise.all([
        this.timedExportJson(mainComponent as unknown as SceneNode, acc.metrics),
        this.walk(mainComponent as unknown as SceneNode, acc),
      ]);

      // dep tree 안의 INSTANCE도 맵에 편입 → 이후 walk에서 getMainComponentAsync dedup 계속 작동.
      this.mergeInstanceMap(info, acc.instanceToComponentId);

      acc.deps[componentId] = {
        pluginData: [],
        info,
        styleTree,
      };
    } catch (e) {
      console.error("Failed to collect instance dependency", e);
    }
  }

  /**
   * JSON_REST_V1 결과의 document 트리를 순회하며 INSTANCE 노드의
   * `id → componentId` 매핑을 누적. 기존 엔트리는 덮어쓰지 않음(먼저 본 게 우선).
   */
  private mergeInstanceMap(
    info: FigmaRestApiResponse,
    map: Map<string, string>,
  ): void {
    const doc = (info as unknown as { document?: Record<string, unknown> }).document;
    if (!doc) return;
    const walk = (n: Record<string, unknown>): void => {
      const t = n.type as string | undefined;
      const id = n.id as string | undefined;
      const cid = n.componentId as string | undefined;
      if (t === "INSTANCE" && id && cid && !map.has(id)) {
        map.set(id, cid);
      }
      const children = n.children as Record<string, unknown>[] | undefined;
      if (Array.isArray(children)) {
        for (const c of children) walk(c);
      }
    };
    walk(doc);
  }

  private collectPluginData(node: SceneNode): { key: string; value: string }[] {
    return node.getPluginDataKeys().map((key) => ({
      key,
      value: node.getPluginData(key),
    }));
  }

  /**
   * exportAsync(JSON_REST_V1) 계측 래퍼.
   */
  private async timedExportJson(
    node: SceneNode,
    metrics: ExtractMetrics,
  ): Promise<FigmaRestApiResponse> {
    const t0 = Date.now();
    const result = (await node.exportAsync({
      format: "JSON_REST_V1",
    })) as FigmaRestApiResponse;
    metrics.exportJSON.ms += Date.now() - t0;
    metrics.exportJSON.count += 1;
    return result;
  }

  /**
   * 속성 해시 기반 dedup 시뮬레이션.
   * JSON_REST_V1 결과 document tree에서 각 노드의 CSS에 영향 주는 원시 속성만
   * 추려 해시한 뒤, total vs unique 비율을 계산. 실제 dedup은 하지 않음.
   */
  private simulateDedup(info: FigmaRestApiResponse, acc: Accumulators): DedupStats {
    const stats: DedupStats = {
      totalNodes: 0,
      uniqueHashes: 0,
      totalVectors: 0,
      uniqueVectorHashes: 0,
      svgExportsActual: Object.keys(acc.vectorSvgs).length,
      imageActual: Object.keys(acc.imageUrls).length,
      depsActual: Object.keys(acc.deps).length,
    };
    const hashes = new Set<string>();
    const vectorHashes = new Set<string>();

    const STYLE_KEYS = [
      "type",
      "fills",
      "strokes",
      "strokeWeight",
      "strokeAlign",
      "individualStrokeWeights",
      "strokeCap",
      "strokeJoin",
      "strokeDashes",
      "effects",
      "cornerRadius",
      "rectangleCornerRadii",
      "cornerSmoothing",
      "layoutMode",
      "layoutWrap",
      "primaryAxisAlignItems",
      "counterAxisAlignItems",
      "primaryAxisSizingMode",
      "counterAxisSizingMode",
      "itemSpacing",
      "counterAxisSpacing",
      "paddingLeft",
      "paddingRight",
      "paddingTop",
      "paddingBottom",
      "layoutSizingHorizontal",
      "layoutSizingVertical",
      "layoutAlign",
      "layoutGrow",
      "layoutPositioning",
      "minWidth",
      "maxWidth",
      "minHeight",
      "maxHeight",
      "opacity",
      "blendMode",
      "rotation",
      "clipsContent",
      "visible",
      "backgroundColor",
      "constraints",
      "style",
      "characters",
      "complexStrokeProperties",
      "booleanOperation",
      "arcData",
    ];
    const VECTOR_SET = new Set<string>([
      "VECTOR",
      "LINE",
      "STAR",
      "ELLIPSE",
      "POLYGON",
      "BOOLEAN_OPERATION",
    ]);

    const hashNode = (n: Record<string, unknown>): string => {
      const sig: Record<string, unknown> = {};
      for (const k of STYLE_KEYS) {
        if (k in n) sig[k] = n[k];
      }
      const bb = n.absoluteBoundingBox as { width?: number; height?: number } | undefined;
      if (bb) sig._size = [bb.width, bb.height];
      // 간단 FNV-1a 해시 (32bit)로 문자열 길이 최소화.
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(sig).sort()) sorted[k] = sig[k];
      const s = JSON.stringify(sorted);
      let h = 0x811c9dc5;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      return (h >>> 0).toString(16);
    };

    const walk = (n: Record<string, unknown>): void => {
      stats.totalNodes += 1;
      const h = hashNode(n);
      hashes.add(h);
      const t = n.type as string | undefined;
      if (t && VECTOR_SET.has(t)) {
        stats.totalVectors += 1;
        vectorHashes.add(h);
      }
      const children = n.children as Record<string, unknown>[] | undefined;
      if (Array.isArray(children)) {
        for (const c of children) walk(c);
      }
    };

    const doc = (info as unknown as { document?: Record<string, unknown> }).document;
    if (doc) walk(doc);

    stats.uniqueHashes = hashes.size;
    stats.uniqueVectorHashes = vectorHashes.size;
    return stats;
  }

  /**
   * 계측 결과를 콘솔에 덤프. 플러그인 sandbox 콘솔에서 확인.
   */
  private reportMetrics(
    node: SceneNode,
    totalMs: number,
    m: ExtractMetrics,
    d: DedupStats,
  ): void {
    const fmt = (ms: number) => `${ms.toFixed(1).padStart(8)}ms`;
    const sum =
      m.getCSS.ms + m.exportSVG.ms + m.exportJSON.ms + m.getMainComponent.ms + m.getImageBytes.ms;
    /* eslint-disable no-console */
    console.log(
      [
        "",
        `═══ [ExtractMetrics] ${node.name} (${node.id}) ═══`,
        `  total wall-time     : ${fmt(totalMs)}`,
        `  async bridge sum    : ${fmt(sum)}  (병렬 실행이라 wall-time과 다름)`,
        `  ─ phases ────────────────────────────`,
        `  getCSSAsync         : ${fmt(m.getCSS.ms)}  x${m.getCSS.count}  (cache hit ${m.cssCacheHit} / miss ${m.cssCacheMiss})`,
        `  exportAsync(SVG)    : ${fmt(m.exportSVG.ms)}  x${m.exportSVG.count}`,
        `  exportAsync(JSON)   : ${fmt(m.exportJSON.ms)}  x${m.exportJSON.count}`,
        `  getMainComponent    : ${fmt(m.getMainComponent.ms)}  x${m.getMainComponent.count}  (실제 호출, map-skip 제외)`,
        `  instance map        : size=${m.instanceMapSize}  hit=${m.instanceMapHit}  miss=${m.instanceMapMiss}`,
        `  instance id sample  : ${m.instanceIdSamples.join(" | ") || "(none)"}`,
        `  map id sample       : ${m.mapIdSamples.join(" | ") || "(none)"}`,
        `  getBytes(image)     : ${fmt(m.getImageBytes.ms)}  x${m.getImageBytes.count}`,
        `  ─ dedup simulation ──────────────────`,
        `  nodes total         : ${d.totalNodes}`,
        `  nodes unique hash   : ${d.uniqueHashes}   (${pct(d.uniqueHashes, d.totalNodes)})`,
        `  → getCSSAsync 이론적 최소: ${d.uniqueHashes}회 (현재 ${m.getCSS.count}회)`,
        `  vectors total       : ${d.totalVectors}`,
        `  vectors unique hash : ${d.uniqueVectorHashes}   (${pct(d.uniqueVectorHashes, d.totalVectors)})`,
        `  SVG export 실제     : ${d.svgExportsActual}회 (id dedup 후)`,
        `  → SVG 이론적 최소   : ${d.uniqueVectorHashes}회`,
        `  deps 실제           : ${d.depsActual}회`,
        `  images 실제         : ${d.imageActual}회`,
        "═══════════════════════════════════════════",
      ].join("\n"),
    );
    /* eslint-enable no-console */
  }
}

interface DedupStats {
  totalNodes: number;
  uniqueHashes: number;
  totalVectors: number;
  uniqueVectorHashes: number;
  svgExportsActual: number;
  imageActual: number;
  depsActual: number;
}

function pct(a: number, b: number): string {
  if (b === 0) return "0%";
  return `${((a / b) * 100).toFixed(1)}%`;
}
