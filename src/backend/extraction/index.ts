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
  /**
   * 캐시에 이미 있는지 동기 조회. selectionchange 등 sync 컨텍스트에서
   * 로딩 신호를 보낼지 결정할 때 사용. LRU 순서를 변경하지 않음.
   */
  peekCache(nodeId: string): boolean;
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

      // 선택한 루트의 자손이 변경되면 루트 cache도 stale해지므로
      // 자손 여부를 parent chain으로 확인 → 영향 있을 때만 재추출 schedule.
      // 삭제된 노드는 추적 불가 → 안전하게 affected로 간주.
      const selection = figma.currentPage.selection;
      if (selection.length === 0) return;
      const target = selection[0];

      let affected = false;
      for (const id of ids) {
        if (id === target.id) {
          affected = true;
          break;
        }
        const changed = figma.getNodeById(id);
        if (!changed) {
          affected = true;
          break;
        }
        let cur: BaseNode | null = changed.parent;
        while (cur) {
          if (cur.id === target.id) {
            affected = true;
            break;
          }
          cur = cur.parent;
        }
        if (affected) break;
      }

      if (affected) {
        cache.invalidate([target.id]);
        dispatcher.schedule({ node: target, bypassCache: false });
      }
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
    peekCache(nodeId: string): boolean {
      return cache.has(nodeId);
    },
  };
}
