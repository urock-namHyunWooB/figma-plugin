// test/audits/hungarianObserver/types.ts

// ── 노드 요약 정보 ──

export interface NodeInfo {
  id: string;
  name: string;
  type: string;
}

// ── 신호 분해 ──

export interface SignalEntry {
  signalName: string;
  kind: string;          // "veto" | "match" | "match-with-cost" | "decisive-match" | "decisive-match-with-cost" | "neutral" | "score"
  cost?: number;
  score?: number;
  reason: string;
  weight: number;
}

// ── Cost matrix cell ──

export interface CellData {
  aIndex: number;        // freeA 내 인덱스
  bIndex: number;        // freeB 내 인덱스
  aNode: NodeInfo;
  bNode: NodeInfo;
  cost: number;          // totalCost (Infinity이면 veto)
  decision: "match" | "veto";
  signals: SignalEntry[];
}

// ── Pass 1 매칭 기록 ──

export interface Pass1Match {
  aNode: NodeInfo;
  bNode: NodeInfo;
  reason: string;        // e.g., "same id"
}

// ── Pass 2 Hungarian 결과 ──

export interface AssignmentEntry {
  aNode: NodeInfo;
  bNode: NodeInfo;
  cost: number;
  accepted: boolean;     // cost <= threshold (0.1)
}

export interface Pass2Data {
  freeA: NodeInfo[];
  freeB: NodeInfo[];
  matrix: CellData[][];  // [bIdx][aIdx] — row=B, col=A
  assignment: AssignmentEntry[];
  unmatched: NodeInfo[];  // B 노드 중 매칭 안 된 것
}

// ── Merge 기록 (재귀 트리) ──

export interface MergeRecord {
  /** Merge 인덱스 (예: "1", "2", "2.1", "2.1.3") */
  index: string;
  /** 부모 노드 이름 경로 (예: "ROOT > Icon/Normal/Check") */
  path: string;
  /** 재귀 깊이 (0 = 루트) */
  depth: number;
  /** A-side children 수 */
  childrenACount: number;
  /** B-side children 수 */
  childrenBCount: number;
  /** variant A 설명 (top-level에서만 의미있음) */
  variantA?: string;
  /** variant B 설명 */
  variantB?: string;
  /** Pass 1 결과 */
  pass1: Pass1Match[];
  /** Pass 2 결과 (freeA=0 or freeB=0이면 undefined) */
  pass2?: Pass2Data;
  /** 재귀 sub-merge (매칭된 children 쌍의 자식 merge) */
  subMerges: MergeRecord[];
}

// ── 최상위 수집 결과 ──

export interface ObserverResult {
  fixture: string;
  variantCount: number;
  mergeOrder: string[];   // variant name 목록 (merge 순서대로)
  merges: MergeRecord[];  // top-level merge records
}

// ── Collector 인터페이스 (globalThis에 세팅될 객체) ──

export interface ObserverCollector {
  /** 현재 fixture 이름 */
  fixture: string;
  /** merge 순서 기록 */
  mergeOrder: string[];
  /** 완료된 top-level merge records */
  merges: MergeRecord[];
  /** 내부 스택 (재귀 추적용) */
  _stack: MergeRecord[];
  /** 내부 카운터 */
  _topLevelCounter: number;
  /** 현재 merge의 variant A 이름 (mergeTreesInOrder에서 설정) */
  _variantA?: string;
  /** 현재 merge의 variant B 이름 */
  _variantB?: string;

  // ── 메서드 ──
  pushMerge(info: {
    path: string;
    depth: number;
    childrenACount: number;
    childrenBCount: number;
    variantA?: string;
    variantB?: string;
  }): void;

  addPass1Match(match: Pass1Match): void;

  setPass2(data: Pass2Data): void;

  popMerge(): void;

  toResult(): ObserverResult;
}
