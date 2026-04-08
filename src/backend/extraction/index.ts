import type { FigmaNodeData } from "@frontend/ui/domain/code-generator2/types/types";
import { ExtractionCache } from "./ExtractionCache";
import { DebouncedDispatcher } from "./DebouncedDispatcher";
import { SingleWalkExtractor } from "./SingleWalkExtractor";

export interface ExtractionPipelineOptions {
  onResult: (data: FigmaNodeData) => void;
  onError: (err: Error) => void;
  /** 캐시 미스로 walk가 실제로 시작될 때 호출. 캐시 히트는 호출 안 됨. */
  onLoading?: () => void;
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
        // 캐시 미스 — walk 시작 전에 로딩 신호
        if (isCurrent()) opts.onLoading?.();
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
