# Backend Node Extraction Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce `selectionchange` → UI extraction latency from ~10s to ~2-3s for variant-heavy COMPONENT_SET, and make repeat selections instant via in-memory cache.

**Architecture:** Replace 4 redundant tree traversals + sequential per-child awaits in `FigmaPlugin.ts` with a single `SingleWalkExtractor` that uses `Promise.all` for both per-node tasks (`getCSSAsync`, vector export, image bytes, instance dependency) and child recursion. Wrap it with `ExtractionCache` (LRU 20 entries, invalidated by `nodechange` events) and `DebouncedDispatcher` (150ms debounce + generation counter to drop stale results).

**Tech Stack:** TypeScript, Figma Plugin API (`@figma/plugin-typings`), Vite (esbuild) build.

**Spec:** `docs/superpowers/specs/2026-04-08-backend-extraction-perf-design.md`

**No automated tests:** Per spec §7, this work has no unit tests. Backend code is hard to test without a `figma` global mock and the user opted for manual regression. Each task ends with a build check and commit; the final task is a manual verification checklist inside Figma.

---

## File Structure

**Created (all under `src/backend/extraction/`):**

| File | Responsibility |
|---|---|
| `ExtractionCache.ts` | Map-based LRU cache (`get` / `set` / `invalidate` / `clear`) |
| `DebouncedDispatcher.ts` | Debounce timer + generation counter for stale-result drop |
| `SingleWalkExtractor.ts` | Unified async tree walk with `Promise.all` parallelism |
| `index.ts` | Factory that wires the three together + Figma event listeners |

**Modified:**

| File | Change |
|---|---|
| `src/backend/FigmaPlugin.ts` | Delete `getNodeData`, `_makeStyleTree`, `_collectDependencies`, `_traverseAndCollect`, `_collectImageUrls`, `_traverseAndCollectImages`, `_collectVectorSvgs`, `_traverseAndCollectVectors`. Add pipeline import + wire `selectionchange` and `REQUEST_REFRESH` through `pipeline.schedule` / `pipeline.fireImmediate`. |

**Untouched (relied on, do not modify):**
- `src/frontend/ui/domain/code-generator2/types/types.ts` — source of `FigmaNodeData`, `FigmaRestApiResponse`, `StyleTree` types. New code imports from here directly. (Note: existing `FigmaPlugin.ts` imports these types from a non-existent path `@frontend/ui/domain/transpiler/types/figma-api`. The current code only works because esbuild erases type-only imports. New files use the correct path.)
- `src/backend/types/messages.ts` — `MESSAGE_TYPES` and `PluginMessage` unchanged.
- All `src/frontend/**` files — `FigmaNodeData` shape preserved.

---

## Background Notes for Implementer

You probably haven't seen this codebase before. Two important constraints:

1. **`documentAccess: dynamic-page` in `manifest.json`** — this means `figma.on("documentchange", ...)` requires `figma.loadAllPagesAsync()` first, which is expensive at startup. We use the lighter alternative: `figma.currentPage.on("nodechange", ...)`. The drawback is that the listener is bound to the current page; on `currentpagechange`, we must re-register it on the new page (and also clear the cache, since cached data from the old page is now stale).

2. **`figma.on("selectionchange")` fires on every click** — there is no native debounce. The current code processes every event synchronously. Our pipeline must add a 150ms debounce to coalesce rapid clicks, plus a generation counter so that an in-flight extraction whose result arrives after a newer selection started can be silently dropped (no `postMessage`).

Run `npm run build:plugin` after every task to confirm TypeScript still compiles. Do not run `npm run dev` unless you intend to keep it running — `build:plugin` is the right verification command for backend changes.

---

## Task 1: Create `ExtractionCache.ts`

**Files:**
- Create: `src/backend/extraction/ExtractionCache.ts`

- [ ] **Step 1: Create the file**

```ts
import type { FigmaNodeData } from "@frontend/ui/domain/code-generator2/types/types";

/**
 * 노드 ID → FigmaNodeData LRU 캐시.
 *
 * Map의 insertion order 특성을 활용:
 * - get hit 시 delete + set으로 가장 최근 위치로 이동
 * - set 시 maxEntries 초과면 keys().next() (가장 오래된 항목) 제거
 *
 * 인메모리 전용. 플러그인 재실행 시 사라짐.
 */
export class ExtractionCache {
  private readonly cache = new Map<string, FigmaNodeData>();

  constructor(private readonly maxEntries: number = 20) {}

  get(nodeId: string): FigmaNodeData | undefined {
    const value = this.cache.get(nodeId);
    if (value === undefined) return undefined;
    // LRU: 가장 최근으로 이동
    this.cache.delete(nodeId);
    this.cache.set(nodeId, value);
    return value;
  }

  set(nodeId: string, data: FigmaNodeData): void {
    if (this.cache.has(nodeId)) {
      this.cache.delete(nodeId);
    } else if (this.cache.size >= this.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(nodeId, data);
  }

  invalidate(nodeIds: Iterable<string>): void {
    for (const id of nodeIds) {
      this.cache.delete(id);
    }
  }

  clear(): void {
    this.cache.clear();
  }
}
```

- [ ] **Step 2: Build to verify it compiles**

Run: `npm run build:plugin`
Expected: build succeeds (`✓ built in <ms>`). The new file isn't imported yet so it has zero runtime impact, but TypeScript is configured to type-check `src/backend/**/*.ts` so any type error will fail.

- [ ] **Step 3: Commit**

```bash
git add src/backend/extraction/ExtractionCache.ts
git commit -m "feat(backend): ExtractionCache — 노드 ID 기반 LRU 캐시 추가"
```

---

## Task 2: Create `DebouncedDispatcher.ts`

**Files:**
- Create: `src/backend/extraction/DebouncedDispatcher.ts`

- [ ] **Step 1: Create the file**

```ts
/**
 * 디바운스된 핸들러 디스패처.
 *
 * - schedule: delayMs 안에 재호출되면 timer 리셋
 * - 발화 시 generation counter 증가, handler에 isCurrent() 콜백 전달
 * - handler는 await 끝났을 때 isCurrent()로 stale 여부 확인 → false면 결과 폐기
 * - fireImmediate: 디바운스 우회, 즉시 발화 (예: REQUEST_REFRESH)
 *
 * 단일 활성 timer만 유지. 실행 중 핸들러는 중단 안 함 — 대신 stale 검사로 결과를 버림.
 */
export class DebouncedDispatcher<T> {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pendingArg: T | null = null;
  private generation = 0;

  constructor(
    private readonly delayMs: number,
    private readonly handler: (arg: T, isCurrent: () => boolean) => Promise<void> | void,
  ) {}

  schedule(arg: T): void {
    this.pendingArg = arg;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      const fired = this.pendingArg as T;
      this.pendingArg = null;
      this.fire(fired);
    }, this.delayMs);
  }

  fireImmediate(arg: T): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
      this.pendingArg = null;
    }
    this.fire(arg);
  }

  private fire(arg: T): void {
    const myGen = ++this.generation;
    const isCurrent = (): boolean => myGen === this.generation;
    void Promise.resolve(this.handler(arg, isCurrent));
  }
}
```

- [ ] **Step 2: Build to verify**

Run: `npm run build:plugin`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/backend/extraction/DebouncedDispatcher.ts
git commit -m "feat(backend): DebouncedDispatcher — 디바운스 + generation counter 추가"
```

---

## Task 3: Create `SingleWalkExtractor.ts`

This is the core of the change. It replaces 7 separate traversal methods with one walk that fans out per-node async work via `Promise.all` and recurses on children in parallel.

**Key correctness invariants:**
- The 4 supplemental cssStyle fixups (opacity / overflow / mix-blend-mode / transform) from the old `_makeStyleTree` (`FigmaPlugin.ts:603-617`) MUST be preserved verbatim — they patch gaps in `getCSSAsync()`.
- `visitedComponents` and `visitedImageHashes` use synchronous "check then mark" within a non-await region. Because JavaScript is single-threaded, this is atomic and prevents duplicate work between concurrent walks.
- INSTANCE dependency collection recursively walks the mainComponent using the same `walk` method, sharing the same accumulators and visited sets.
- `exportAsync({ format: "JSON_REST_V1" })` cannot be folded into `walk` because Figma runs its own internal walk for it. It is dispatched in parallel with the walk via `Promise.all`.

**Files:**
- Create: `src/backend/extraction/SingleWalkExtractor.ts`

- [ ] **Step 1: Create the file**

```ts
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
```

- [ ] **Step 2: Build to verify**

Run: `npm run build:plugin`
Expected: build succeeds. If TypeScript complains about `Paint`, `BlendMode`, `InstanceNode`, or `NodeType`, those are global ambient types from `@figma/plugin-typings` and should resolve automatically — verify `tsconfig.json` includes `"./node_modules/@figma"` in `typeRoots` (it does).

- [ ] **Step 3: Commit**

```bash
git add src/backend/extraction/SingleWalkExtractor.ts
git commit -m "feat(backend): SingleWalkExtractor — 단일 walk + Promise.all 병렬 추가"
```

---

## Task 4: Create `extraction/index.ts` factory

This wires `ExtractionCache`, `DebouncedDispatcher`, and `SingleWalkExtractor` together and registers Figma event listeners (`nodechange` for cache invalidation, `currentpagechange` for cache reset + listener re-registration).

**Files:**
- Create: `src/backend/extraction/index.ts`

- [ ] **Step 1: Create the file**

```ts
import type { FigmaNodeData } from "@frontend/ui/domain/code-generator2/types/types";
import { ExtractionCache } from "./ExtractionCache";
import { DebouncedDispatcher } from "./DebouncedDispatcher";
import { SingleWalkExtractor } from "./SingleWalkExtractor";

export interface ExtractionPipelineOptions {
  onResult: (data: FigmaNodeData) => void;
  onError: (err: Error) => void;
  /** 디바운스 지연 (ms). 기본 150. */
  debounceMs?: number;
  /** 캐시 LRU 상한. 기본 20. */
  cacheSize?: number;
}

export interface ExtractionPipeline {
  /** selectionchange 등 디바운스가 필요한 경로용. */
  schedule(node: SceneNode): void;
  /** REQUEST_REFRESH 등 즉시 발화 + 캐시 우회용. */
  fireImmediate(node: SceneNode, bypassCache?: boolean): void;
}

interface DispatchArg {
  node: SceneNode;
  bypassCache: boolean;
}

/**
 * Backend 추출 파이프라인 생성.
 *
 * 와이어링:
 *   selectionchange → schedule → DebouncedDispatcher (150ms)
 *                                  ↓ (gen 증가)
 *                              cache.get() hit → onResult (즉시)
 *                                  ↓ miss
 *                              SingleWalkExtractor.extract()
 *                                  ↓ (isCurrent() OK면) cache.set + onResult
 *
 * 무효화:
 *   currentPage.on("nodechange") → 변경 노드 ID만 cache.invalidate
 *   figma.on("currentpagechange") → cache.clear + 새 페이지에 nodechange 리스너 재등록
 */
export function createExtractionPipeline(opts: ExtractionPipelineOptions): ExtractionPipeline {
  const cache = new ExtractionCache(opts.cacheSize ?? 20);
  const extractor = new SingleWalkExtractor();

  const dispatcher = new DebouncedDispatcher<DispatchArg>(
    opts.debounceMs ?? 150,
    async ({ node, bypassCache }, isCurrent) => {
      try {
        if (!bypassCache) {
          const cached = cache.get(node.id);
          if (cached) {
            if (isCurrent()) opts.onResult(cached);
            return;
          }
        }
        const data = await extractor.extract(node);
        if (!isCurrent()) return; // 새 선택 도착 — 결과 폐기
        cache.set(node.id, data);
        opts.onResult(data);
      } catch (e) {
        if (!isCurrent()) return;
        opts.onError(e instanceof Error ? e : new Error(String(e)));
      }
    },
  );

  // nodechange 리스너 — 페이지 단위로 등록되므로 currentpagechange 시 재등록 필요
  let listenerPage: PageNode | null = null;
  let currentListener: ((event: NodeChangeEvent) => void) | null = null;

  const installNodeChangeListener = (): void => {
    if (listenerPage && currentListener) {
      try {
        listenerPage.off("nodechange", currentListener);
      } catch {
        // 페이지가 이미 사라졌으면 무시
      }
    }
    const listener = (event: NodeChangeEvent): void => {
      const ids = new Set<string>();
      for (const change of event.nodeChanges) {
        ids.add(change.id);
      }
      if (ids.size > 0) cache.invalidate(ids);
    };
    figma.currentPage.on("nodechange", listener);
    listenerPage = figma.currentPage;
    currentListener = listener;
  };

  installNodeChangeListener();

  figma.on("currentpagechange", () => {
    cache.clear();
    installNodeChangeListener();
  });

  return {
    schedule(node: SceneNode): void {
      dispatcher.schedule({ node, bypassCache: false });
    },
    fireImmediate(node: SceneNode, bypassCache = false): void {
      dispatcher.fireImmediate({ node, bypassCache });
    },
  };
}
```

- [ ] **Step 2: Build to verify**

Run: `npm run build:plugin`
Expected: build succeeds. If TypeScript complains about `NodeChangeEvent`, `PageNode`, those are also ambient globals from `@figma/plugin-typings`.

- [ ] **Step 3: Commit**

```bash
git add src/backend/extraction/index.ts
git commit -m "feat(backend): extraction pipeline factory — 캐시 + 디바운스 + nodechange 무효화 와이어링"
```

---

## Task 5: Wire pipeline into `FigmaPlugin.ts` and delete old methods

This is the integration step. After this task, `FigmaPlugin.ts` shrinks dramatically.

**Files:**
- Modify: `src/backend/FigmaPlugin.ts`

- [ ] **Step 1: Read the current file to confirm line numbers**

Run: `wc -l src/backend/FigmaPlugin.ts`
Expected: ~645 lines. The methods to delete are at:
- `getNodeData` (lines 398-434)
- `_collectVectorSvgs` (lines 439-447)
- `_traverseAndCollectVectors` (lines 452-481)
- `_collectImageUrls` (lines 486-495)
- `_traverseAndCollectImages` (lines 500-537)
- `_collectDependencies` (lines 542-551)
- `_traverseAndCollect` (lines 556-596)
- `_makeStyleTree` (lines 598-644)

The `selectionchange` handler at lines 45-51 and the `REQUEST_REFRESH` branch at lines 24-41 are also rewritten.

- [ ] **Step 2: Replace the imports block at the top**

Find this (currently lines 3-9):

```ts
import { MESSAGE_TYPES, PluginMessage } from "./types/messages";

import {
  FigmaNodeData,
  FigmaRestApiResponse,
  StyleTree,
} from "@frontend/ui/domain/transpiler/types/figma-api";
```

Replace with:

```ts
import { MESSAGE_TYPES, PluginMessage } from "./types/messages";
import { createExtractionPipeline, type ExtractionPipeline } from "./extraction";
```

(`FigmaNodeData` / `FigmaRestApiResponse` / `StyleTree` are no longer needed in this file because all data assembly moved to `SingleWalkExtractor`. The broken `@frontend/ui/domain/transpiler/types/figma-api` path is removed entirely.)

- [ ] **Step 3: Add the pipeline field on the class and replace the `initialize` body**

Find this (currently lines 15-52):

```ts
export class FigmaPlugin {
  /**
   * 플러그인 초기화
   */
  async initialize(): Promise<void> {
    // UI 표시
    figma.showUI(__html__, { width: 500, height: 1000 });

    figma.ui.onmessage = async (msg) => {
      if (msg.type === MESSAGE_TYPES.REQUEST_REFRESH) {
        const selection = figma.currentPage.selection;
        if (selection.length === 0) return;
        const target = selection[0];
        const componentSet =
          target.type === "COMPONENT_SET"
            ? target
            : target.parent?.type === "COMPONENT_SET"
              ? target.parent
              : null;
        const nodes = componentSet ? [componentSet as SceneNode] : [...selection];
        const data = await this.getNodeData(nodes);
        figma.ui.postMessage({
          type: MESSAGE_TYPES.ON_SELECTION_CHANGE,
          data,
        });
        return;
      }
      await this.handleMessage(msg);
    };

    figma.on("selectionchange", async () => {
      const data = await this.getNodeData([...figma.currentPage.selection]);
      figma.ui.postMessage({
        type: MESSAGE_TYPES.ON_SELECTION_CHANGE,
        data,
      });
    });
  }
```

Replace with:

```ts
export class FigmaPlugin {
  private pipeline!: ExtractionPipeline;

  /**
   * 플러그인 초기화
   */
  async initialize(): Promise<void> {
    // UI 표시
    figma.showUI(__html__, { width: 500, height: 1000 });

    // 추출 파이프라인 생성: 캐시 + 디바운스 + 단일 walk 병렬 추출
    this.pipeline = createExtractionPipeline({
      onResult: (data) => {
        figma.ui.postMessage({
          type: MESSAGE_TYPES.ON_SELECTION_CHANGE,
          data,
        });
      },
      onError: (err) => {
        console.error("Extraction failed:", err);
        figma.ui.postMessage({
          type: MESSAGE_TYPES.ON_SELECTION_CHANGE,
          data: null,
          error: err.message,
        });
      },
    });

    figma.ui.onmessage = async (msg) => {
      if (msg.type === MESSAGE_TYPES.REQUEST_REFRESH) {
        const selection = figma.currentPage.selection;
        if (selection.length === 0) return;
        const target = selection[0];
        const componentSet =
          target.type === "COMPONENT_SET"
            ? target
            : target.parent?.type === "COMPONENT_SET"
              ? target.parent
              : null;
        const node = componentSet ?? target;
        // 새로고침은 디바운스 우회 + 캐시 우회
        this.pipeline.fireImmediate(node as SceneNode, true);
        return;
      }
      await this.handleMessage(msg);
    };

    figma.on("selectionchange", () => {
      const selection = figma.currentPage.selection;
      if (selection.length === 0) return;
      this.pipeline.schedule(selection[0]);
    });
  }
```

- [ ] **Step 4: Delete the 8 obsolete methods (`getNodeData` and 7 traversal helpers)**

Delete these methods entirely:
- `getNodeData` (originally lines 398-434)
- `_collectVectorSvgs` (originally lines 439-447)
- `_traverseAndCollectVectors` (originally lines 452-481)
- `_collectImageUrls` (originally lines 486-495)
- `_traverseAndCollectImages` (originally lines 500-537)
- `_collectDependencies` (originally lines 542-551)
- `_traverseAndCollect` (originally lines 556-596)
- `_makeStyleTree` (originally lines 598-644)

Keep these methods (they handle other message types and are out of scope):
- `arrayBufferToBase64`
- `handleMessage`
- `handleCancel`
- `handleSelectNode`
- `handleExportSelectionImage`
- `handleGitHubFetch`
- `handleExtractDesignTokens`
- `resolveVariableValue`
- `rgbaToHex`

After deletion the class should end after `rgbaToHex`. Total file should drop from ~645 lines to ~390 lines.

- [ ] **Step 5: Build to verify**

Run: `npm run build:plugin`
Expected: build succeeds (`✓ built in <ms>`). The output `dist/code.js` should grow slightly because the pipeline modules are now linked in.

If the build fails with `Cannot find name 'FigmaNodeData'` or similar, you missed deleting a reference. Search:

Run: `grep -n "FigmaNodeData\|FigmaRestApiResponse\|StyleTree\|getNodeData\|_makeStyleTree\|_collect\|_traverseAndCollect" src/backend/FigmaPlugin.ts`
Expected: no matches.

- [ ] **Step 6: Lint check**

Run: `npm run lint -- src/backend/FigmaPlugin.ts src/backend/extraction`
Expected: no errors. Warnings about unused vars in deleted areas should be gone.

- [ ] **Step 7: Commit**

```bash
git add src/backend/FigmaPlugin.ts
git commit -m "refactor(backend): FigmaPlugin → 추출 파이프라인 위임, 7개 트리 순회 메서드 삭제"
```

---

## Task 6: Manual verification in Figma

Per spec §7, no automated tests. This task is the regression checklist.

**Files:** None modified.

- [ ] **Step 1: Production build for plugin loading**

Run: `npm run build:prod`
Expected: both `dist/code.js` and `dist/index.html` produced without errors.

- [ ] **Step 2: Load the plugin in Figma**

In Figma desktop app: `Plugins → Development → Import plugin from manifest...` → select `manifest.json` from this repo. (If already imported, just reload via `Plugins → Development → <plugin name>`.)

- [ ] **Step 3: First-selection latency check**

1. Open a Figma file with a variant-heavy COMPONENT_SET (Button, Card, etc.)
2. Click the plugin to open it
3. Click the COMPONENT_SET in the canvas
4. Time how long until the UI updates with extracted data

Expected: **2-3 seconds** (down from ~10s). If still >5s, the structural fix didn't land — verify Task 3's `Promise.all` blocks are present and `walk` is awaited only at the top of `extract`.

- [ ] **Step 4: Cache hit (re-selection) check**

1. Click somewhere blank to deselect
2. Click the same COMPONENT_SET again
3. Time how long until the UI updates

Expected: **<200ms** (cache hit, no re-extraction). If still slow, verify Task 4's `cache.get(node.id)` branch is taken.

- [ ] **Step 5: Stale-result drop check**

1. Click COMPONENT_SET A → wait for UI to update
2. Quickly click COMPONENT_SET B before A's first load fully settles
3. Quickly click COMPONENT_SET C right after
4. Wait

Expected: UI ends up showing C's data, not A or B. No flicker between intermediate results. (If you see UI rapidly cycling A → B → C, the generation counter isn't dropping stale results — verify Task 4's `if (!isCurrent()) return;` line.)

- [ ] **Step 6: Cache invalidation on edit**

1. Click COMPONENT_SET → wait for UI (cache populated)
2. Edit a fill or text inside that COMPONENT_SET in Figma
3. Click somewhere else, then click the COMPONENT_SET again
4. UI should reflect the edit

Expected: edited data appears (cache was invalidated by `nodechange` event). If you see the pre-edit data, `installNodeChangeListener` is not wired correctly.

- [ ] **Step 7: Page change cache clear**

1. Click COMPONENT_SET on Page 1 → wait for UI
2. Switch to Page 2
3. Switch back to Page 1, click the same COMPONENT_SET

Expected: re-extraction runs (slower than cache hit), data still correct. (Cache was cleared on page change.)

- [ ] **Step 8: Output regression spot-check**

Generate code (Emotion or Tailwind, whichever is the default) for one fixture you used previously and compare with the previous output. There should be **no diff** in generated React code. (The data shape is unchanged; only how we extract it.)

If you see any diff in generated code, the bug is in the cssStyle fixups or the styleTree assembly order — re-read Task 3 Step 1's `getCssWithFixups` and confirm all 4 fixups are present and applied in the same order as the original `_makeStyleTree`.

- [ ] **Step 9: Commit (or revert)**

If all checks pass:

```bash
git commit --allow-empty -m "test(backend): manual regression — 추출 파이프라인 검증 통과"
```

If any check fails, revert the offending commit, diagnose, fix, re-test. Do not proceed with a partial pass.

---

## Out of Scope (Future Work)

Per spec §10, these are explicitly not part of this plan:

- **Lazy/streaming transmission** of vectors/images/dependencies (would require frontend changes to handle partial data).
- **`handleExtractDesignTokens` optimization** (separate `figma.currentPage.findAll()` + full document COMPONENT_SET scan; needs its own design).
- **Replacing `exportAsync(JSON_REST_V1)`** with hand-built field extraction.
- **Automated test infrastructure** (`figma` global mocking).

If after Task 6 the first-selection latency is still >5s, the next step is to instrument with `console.time` around `extract`, `walk`, and the four sideTask categories to find the dominant bottleneck — then revisit whether one of the out-of-scope items needs to be promoted into a follow-up plan.
