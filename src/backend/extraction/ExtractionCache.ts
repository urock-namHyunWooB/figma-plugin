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

  /** LRU 순서를 변경하지 않는 존재 여부 조회. */
  has(nodeId: string): boolean {
    return this.cache.has(nodeId);
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
