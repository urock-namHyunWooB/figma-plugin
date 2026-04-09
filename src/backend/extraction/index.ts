import type { FigmaNodeData } from "@frontend/ui/domain/code-generator2/types/types";
import { ExtractionCache } from "./ExtractionCache";
import { DebouncedDispatcher } from "./DebouncedDispatcher";
import { SingleWalkExtractor } from "./SingleWalkExtractor";

export interface ExtractionPipelineOptions {
  onResult: (data: FigmaNodeData) => void;
  onError: (err: Error) => void;
  /** UI에 로딩 신호를 보내는 콜백 (overlay 깜빡임 → React 강제 리렌더 트리거) */
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
        if (!isCurrent()) return;
        cache.set(node.id, data);
        opts.onResult(data);
      } catch (e) {
        if (!isCurrent()) return;
        opts.onError(e instanceof Error ? e : new Error(String(e)));
      }
    },
  );

  // documentchange listener — dynamic-page 모드에서 페이지 종속 없이 모든 변경 수신.
  // (loadAllPagesAsync 선행 호출 필요 — FigmaPlugin.initialize에서 처리됨)
  // 변경된 노드가 현재 선택된 컴포넌트의 자손이면 자동 재추출 트리거.
  // dynamic-page 모드에서 figma.getNodeById는 throw → listener는 sync 유지하고
  // 내부 작업만 async IIFE로 감싸 getNodeByIdAsync 사용.
  figma.on("documentchange", (event) => {
    const ids = new Set<string>();
    for (const change of event.documentChanges) {
      if ("id" in change) ids.add(change.id);
    }
    if (ids.size > 0) cache.invalidate(ids);

    const selection = figma.currentPage.selection;
    if (selection.length === 0) return;
    const target = selection[0];
    const targetId = target.id;

    void (async () => {
      let affected = false;
      for (const id of ids) {
        if (id === targetId) {
          affected = true;
          break;
        }
        let changed: BaseNode | null = null;
        try {
          changed = await figma.getNodeByIdAsync(id);
        } catch {
          changed = null;
        }
        if (!changed) {
          affected = true;
          break;
        }
        let cur: BaseNode | null = changed.parent;
        while (cur) {
          if (cur.id === targetId) {
            affected = true;
            break;
          }
          cur = cur.parent;
        }
        if (affected) break;
      }

      if (affected) {
        // Refresh 버튼과 동일 경로 — UI overlay 깜빡임 + 캐시 우회 + 즉시 발화
        opts.onLoading?.();
        cache.invalidate([targetId]);
        dispatcher.fireImmediate({ node: target, bypassCache: true });
      }
    })();
  });

  figma.on("currentpagechange", () => {
    cache.clear();
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
