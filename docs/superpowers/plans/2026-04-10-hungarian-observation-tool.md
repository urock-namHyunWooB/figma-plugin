# Hungarian Matrix Observer 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fixture 하나를 입력받아 VariantMerger가 수행한 모든 Hungarian 매칭의 cost matrix, 신호별 분해, 최종 assignment를 계층적으로 덤프하는 순수 관찰 도구.

**Architecture:** `globalThis.__HUNGARIAN_OBSERVER__`에 collector 객체를 세팅 → VariantMerger.mergeChildren이 각 pass에서 데이터를 collector에 push → test entry point가 collector 데이터를 text/JSON으로 포맷해 출력. NodeMatcher에 `getDecision()` 메서드 1개 추가 (MatchDecision 전체를 반환하는 thin wrapper).

**Tech Stack:** TypeScript, Vitest, 기존 MatchDecisionEngine/MatchSignal 타입 재사용

**선행 문서:**
- `docs/superpowers/specs/2026-04-10-hungarian-observation-tool-design.md` (Spec B)
- Spec A (엔진 통합) 완료 전제 — 모든 경로는 `processors/variant-merger/` 기준

---

## 파일 구조

```
test/audits/
├── hungarianObserver.test.ts          # vitest entry point (npm run audit:observe)
└── hungarianObserver/
    ├── types.ts                       # observer 데이터 타입
    ├── ObserverCollector.ts           # 수집기 클래스
    └── formatText.ts                  # text 모드 포맷터

src/.../processors/variant-merger/
├── NodeMatcher.ts                     # getDecision() 메서드 1개 추가
└── VariantMerger.ts                   # observer hook 삽입 (mergeChildren, mergeTreesInOrder)

package.json                           # audit:observe script 추가
```

---

## Task 1: Observer 데이터 타입 정의

**Files:**
- Create: `test/audits/hungarianObserver/types.ts`

- [ ] **Step 1: 타입 파일 생성**

```ts
// test/audits/hungarianObserver/types.ts

import type { SignalResult } from "@code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/match-engine/MatchSignal";

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
```

- [ ] **Step 2: 파일 존재 확인**

```bash
cat test/audits/hungarianObserver/types.ts | head -5
```

Expected: `// test/audits/hungarianObserver/types.ts` 출력.

- [ ] **Step 3: Commit**

```bash
git add test/audits/hungarianObserver/types.ts
git commit -m "feat(observer): Hungarian observer 데이터 타입 정의"
```

---

## Task 2: ObserverCollector 구현

**Files:**
- Create: `test/audits/hungarianObserver/ObserverCollector.ts`

- [ ] **Step 1: Collector 클래스 구현**

```ts
// test/audits/hungarianObserver/ObserverCollector.ts

import type {
  ObserverCollector as IObserverCollector,
  ObserverResult,
  MergeRecord,
  Pass1Match,
  Pass2Data,
} from "./types";

export function createObserverCollector(fixture: string): IObserverCollector {
  const collector: IObserverCollector = {
    fixture,
    mergeOrder: [],
    merges: [],
    _stack: [],
    _topLevelCounter: 0,

    pushMerge(info) {
      let index: string;
      if (this._stack.length === 0) {
        // Top-level merge
        this._topLevelCounter++;
        index = String(this._topLevelCounter);
      } else {
        // Sub-merge: parent index + "." + sibling count
        const parent = this._stack[this._stack.length - 1];
        const siblingNum = parent.subMerges.length + 1;
        index = `${parent.index}.${siblingNum}`;
      }

      const record: MergeRecord = {
        index,
        path: info.path,
        depth: info.depth,
        childrenACount: info.childrenACount,
        childrenBCount: info.childrenBCount,
        variantA: info.variantA,
        variantB: info.variantB,
        pass1: [],
        pass2: undefined,
        subMerges: [],
      };

      if (this._stack.length > 0) {
        this._stack[this._stack.length - 1].subMerges.push(record);
      } else {
        this.merges.push(record);
      }
      this._stack.push(record);
    },

    addPass1Match(match: Pass1Match) {
      if (this._stack.length === 0) return;
      this._stack[this._stack.length - 1].pass1.push(match);
    },

    setPass2(data: Pass2Data) {
      if (this._stack.length === 0) return;
      this._stack[this._stack.length - 1].pass2 = data;
    },

    popMerge() {
      this._stack.pop();
    },

    toResult(): ObserverResult {
      return {
        fixture: this.fixture,
        variantCount: this.mergeOrder.length,
        mergeOrder: [...this.mergeOrder],
        merges: this.merges,
      };
    },
  };

  return collector;
}
```

- [ ] **Step 2: Commit**

```bash
git add test/audits/hungarianObserver/ObserverCollector.ts
git commit -m "feat(observer): ObserverCollector 수집기 구현"
```

---

## Task 3: NodeMatcher에 getDecision() 추가

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/NodeMatcher.ts`

- [ ] **Step 1: MatchDecision 타입 import 추가**

NodeMatcher.ts의 import 블록(line 4-9)에서 `MatchDecision` 타입을 추가:

```ts
import {
  createDefaultEngine,
  defaultMatchingPolicy,
  type MatchContext,
  type MatchDecisionEngine,
  type MatchDecision,          // ← 추가
} from "./match-engine";
```

`MatchDecision`이 이미 `match-engine/index.ts`에서 re-export되는지 확인. 아직 안 되어 있으면 `match-engine/index.ts`에 추가:

```ts
export type { MatchSignal, SignalResult, MatchContext, MatchDecision } from "./MatchSignal";
```

(`MatchDecision`이 이미 있으면 이 단계 스킵)

- [ ] **Step 2: getDecision() 메서드 추가**

NodeMatcher 클래스 내, `getPositionCost()` 메서드 바로 아래(line 90 부근)에 추가:

```ts
  /**
   * 두 노드의 full MatchDecision 반환. Observer용.
   * getPositionCost()와 같은 엔진 호출이지만 signalResults까지 전체 반환.
   */
  public getDecision(nodeA: InternalNode, nodeB: InternalNode): MatchDecision {
    return this.engine.decide(nodeA, nodeB, this.makeCtx());
  }
```

- [ ] **Step 3: tsc 확인**

Run: `npx tsc --noEmit 2>&1 | tail -5`
Expected: 에러 없음.

- [ ] **Step 4: 기존 테스트 통과 확인**

Run: `npx vitest run test/tree-builder/nodeMatcher.test.ts 2>&1 | tail -5`
Expected: 모든 기존 테스트 통과.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/NodeMatcher.ts
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/match-engine/index.ts
git commit -m "feat(observer): NodeMatcher.getDecision() 추가 — full MatchDecision 반환"
```

---

## Task 4: VariantMerger observer hook 삽입

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/VariantMerger.ts`

이 task가 전체 작업의 핵심. `mergeTreesInOrder`과 `mergeChildren` 두 메서드에 observer hook을 삽입한다.

- [ ] **Step 1: ObserverCollector 타입 import (타입 전용)**

VariantMerger.ts 상단의 import 블록 끝에 추가:

```ts
import type { MatchDecision } from "./match-engine/MatchSignal";
```

(`ObserverCollector` 타입은 test에 있으므로 import 안 함. globalThis로 duck-typing)

- [ ] **Step 2: observer 접근 헬퍼 추가**

`VariantMerger` 클래스 내 private 헬퍼 추가 (클래스 맨 아래쪽):

```ts
  // ===========================================================================
  // Private: Observer hook helpers
  // ===========================================================================

  private get observer(): any {
    return (globalThis as any).__HUNGARIAN_OBSERVER__;
  }

  private nodeInfo(node: InternalNode) {
    return { id: node.id, name: node.name, type: node.type };
  }
```

- [ ] **Step 3: mergeTreesInOrder에 merge order 기록 hook 추가**

`mergeTreesInOrder` 메서드 (현재 line 164 부근) 수정. `for` 루프 안에서 각 merge 전에 variant 이름 기록:

기존:
```ts
  private mergeTreesInOrder(
    graph: VariantGraph,
    mergeOrder: number[]
  ): InternalTree {
    let merged = graph.nodes[mergeOrder[0]].tree;
    let prevProps = graph.nodes[mergeOrder[0]].props;

    for (let i = 1; i < mergeOrder.length; i++) {
```

수정:
```ts
  private mergeTreesInOrder(
    graph: VariantGraph,
    mergeOrder: number[]
  ): InternalTree {
    let merged = graph.nodes[mergeOrder[0]].tree;
    let prevProps = graph.nodes[mergeOrder[0]].props;

    // Observer: merge 순서 기록
    const obs = this.observer;
    if (obs) {
      for (const idx of mergeOrder) {
        obs.mergeOrder.push(graph.nodes[idx].variantName);
      }
    }

    for (let i = 1; i < mergeOrder.length; i++) {
      // Observer: 현재 merge의 variant pair 설정 (root-level mergeChildren이 읽음)
      if (obs) {
        obs._variantA = i === 1
          ? graph.nodes[mergeOrder[0]].variantName
          : "(merged)";
        obs._variantB = graph.nodes[mergeOrder[i]].variantName;
      }
```

- [ ] **Step 4: mergeChildren에 observer hook 삽입**

이 부분이 가장 중요하다. `mergeChildren` 메서드 전체를 수정. 핵심 변경:

1. **메서드 시작**: observer에 merge 시작 알림 (`pushMerge`)
2. **Pass 1 각 매칭**: `addPass1Match` 호출
3. **Pass 2 cost matrix**: 각 cell에서 `getDecision()` 호출해 signal 분해 캡처
4. **Hungarian assignment 후**: 결과 기록 (`setPass2`)
5. **메서드 끝**: observer에 merge 종료 알림 (`popMerge`)

수정된 `mergeChildren`:

```ts
  private mergeChildren(
    childrenA: InternalNode[],
    childrenB: InternalNode[],
    propDiff: PropDiffInfo,
    _obsParentName?: string,   // observer용: 부모 노드 이름
    _obsDepth?: number,        // observer용: 재귀 깊이
  ): InternalNode[] {
    const obs = this.observer;
    const depth = _obsDepth ?? 0;
    const parentName = _obsParentName ?? "ROOT";

    // Observer: merge 시작
    if (obs) {
      obs.pushMerge({
        path: parentName,
        depth,
        childrenACount: childrenA.length,
        childrenBCount: childrenB.length,
        variantA: depth === 0 ? obs._variantA : undefined,
        variantB: depth === 0 ? obs._variantB : undefined,
      });
    }

    const merged: InternalNode[] = [...childrenA];
    const usedA = new Set<number>();
    const usedB = new Set<number>();

    // === Pass 1: 확정 매칭 ===
    for (let bi = 0; bi < childrenB.length; bi++) {
      if (usedB.has(bi)) continue;
      for (let ai = 0; ai < merged.length; ai++) {
        if (usedA.has(ai)) continue;
        if (this.nodeMatcher!.isDefiniteMatch(merged[ai], childrenB[bi])) {
          usedA.add(ai);
          usedB.add(bi);

          // Observer: Pass 1 매칭 기록
          if (obs) {
            obs.addPass1Match({
              aNode: this.nodeInfo(merged[ai]),
              bNode: this.nodeInfo(childrenB[bi]),
              reason: "same id",
            });
          }

          merged[ai] = this.mergeMatchedNodes(
            merged[ai], childrenB[bi], propDiff, depth,
          );
          break;
        }
      }
    }

    // === Pass 2: Hungarian algorithm으로 최적 매칭 ===
    const freeA = merged.map((_, i) => i).filter(i => !usedA.has(i));
    const freeB = childrenB.map((_, i) => i).filter(i => !usedB.has(i));

    if (freeA.length > 0 && freeB.length > 0) {
      const costMatrix: number[][] = [];
      // Observer: cell-level signal 분해를 위한 decision 캐시
      const decisions: MatchDecision[][] | undefined = obs ? [] : undefined;

      for (const bi of freeB) {
        const row: number[] = [];
        const decRow: MatchDecision[] | undefined = obs ? [] : undefined;
        for (const ai of freeA) {
          if (obs) {
            const dec = this.nodeMatcher!.getDecision(merged[ai], childrenB[bi]);
            row.push(dec.totalCost);
            decRow!.push(dec);
          } else {
            row.push(this.nodeMatcher!.getPositionCost(merged[ai], childrenB[bi]));
          }
        }
        costMatrix.push(row);
        if (decisions) decisions.push(decRow!);
      }

      const assignment = this.hungarian(costMatrix);

      // Observer: Pass 2 데이터 수집
      if (obs && decisions) {
        const freeANodes = freeA.map(ai => this.nodeInfo(merged[ai]));
        const freeBNodes = freeB.map(bi => this.nodeInfo(childrenB[bi]));

        const matrixData = decisions.map((decRow, ri) =>
          decRow.map((dec, ci) => ({
            aIndex: ci,
            bIndex: ri,
            aNode: freeANodes[ci],
            bNode: freeBNodes[ri],
            cost: dec.totalCost,
            decision: dec.decision,
            signals: dec.signalResults.map(sr => ({
              signalName: sr.signalName,
              kind: sr.result.kind,
              cost: "cost" in sr.result ? (sr.result as any).cost : undefined,
              score: "score" in sr.result ? (sr.result as any).score : undefined,
              reason: sr.result.reason,
              weight: sr.weight,
            })),
          })),
        );

        const assignmentEntries = assignment
          .map((ci, ri) => {
            if (ci === -1) return null;
            const cost = costMatrix[ri][ci];
            return {
              aNode: freeANodes[ci],
              bNode: freeBNodes[ri],
              cost,
              accepted: cost <= 0.1,
            };
          })
          .filter((e): e is NonNullable<typeof e> => e !== null);

        const unmatchedBIndices = new Set(
          freeB.map((_, i) => i),
        );
        for (let ri = 0; ri < assignment.length; ri++) {
          const ci = assignment[ri];
          if (ci !== -1 && costMatrix[ri][ci] <= 0.1) {
            unmatchedBIndices.delete(ri);
          }
        }

        obs.setPass2({
          freeA: freeANodes,
          freeB: freeBNodes,
          matrix: matrixData,
          assignment: assignmentEntries,
          unmatched: [...unmatchedBIndices].map(ri => freeBNodes[ri]),
        });
      }

      // 기존 assignment 적용 로직 (변경 없음)
      for (let ri = 0; ri < assignment.length; ri++) {
        const ci = assignment[ri];
        if (ci === -1) continue;
        const cost = costMatrix[ri][ci];
        if (cost > 0.1) continue;

        const ai = freeA[ci];
        const bi = freeB[ri];
        usedA.add(ai);
        usedB.add(bi);
        merged[ai] = this.mergeMatchedNodes(
          merged[ai], childrenB[bi], propDiff, depth,
        );
      }
    } else if (obs) {
      // freeA 또는 freeB가 비어서 Pass 2 스킵 — observer에 빈 pass2 기록
      // (pass2 = undefined로 유지, pushMerge에서 이미 초기화됨)
    }

    // 매칭되지 않은 B 노드를 끝에 추가 (변경 없음)
    for (let bi = 0; bi < childrenB.length; bi++) {
      if (!usedB.has(bi)) {
        merged.push(childrenB[bi]);
      }
    }

    // Observer: merge 종료
    if (obs) {
      obs.popMerge();
    }

    return merged;
  }
```

- [ ] **Step 5: mergeMatchedNodes에 depth/name 전달**

`mergeMatchedNodes` 메서드를 수정해 재귀 호출 시 observer 정보를 전달:

기존:
```ts
  private mergeMatchedNodes(
    nodeA: InternalNode,
    nodeB: InternalNode,
    propDiff: PropDiffInfo
  ): InternalNode {
    return {
      ...nodeA,
      mergedNodes: [
        ...(nodeA.mergedNodes || []),
        ...(nodeB.mergedNodes || []),
      ],
      children: this.mergeChildren(
        nodeA.children,
        nodeB.children,
        propDiff
      ),
    };
  }
```

수정:
```ts
  private mergeMatchedNodes(
    nodeA: InternalNode,
    nodeB: InternalNode,
    propDiff: PropDiffInfo,
    parentDepth?: number,
  ): InternalNode {
    return {
      ...nodeA,
      mergedNodes: [
        ...(nodeA.mergedNodes || []),
        ...(nodeB.mergedNodes || []),
      ],
      children: this.mergeChildren(
        nodeA.children,
        nodeB.children,
        propDiff,
        nodeA.name,                       // observer: 부모 이름
        (parentDepth ?? 0) + 1,           // observer: depth 증가
      ),
    };
  }
```

- [ ] **Step 6: tsc 확인**

Run: `npx tsc --noEmit 2>&1 | tail -10`
Expected: 에러 없음.

- [ ] **Step 7: 기존 테스트 통과 확인 (observer OFF 상태에서)**

Run: `npm run test 2>&1 | tail -5`
Expected: baseline과 동일 (120 passed, 5 failed).

- [ ] **Step 8: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/VariantMerger.ts
git commit -m "feat(observer): VariantMerger에 Hungarian observer hook 삽입

mergeChildren: pushMerge/popMerge, Pass 1 match 기록, Pass 2 cost
matrix signal 분해 캡처, Hungarian assignment 기록.
mergeTreesInOrder: merge 순서 기록.
mergeMatchedNodes: 재귀 depth/name 전달.

observer 미활성 시 기존 동작과 100% 동일 (observer check는 모두
early return guard)."
```

---

## Task 5: Text 포맷터

**Files:**
- Create: `test/audits/hungarianObserver/formatText.ts`

- [ ] **Step 1: 포맷터 구현**

```ts
// test/audits/hungarianObserver/formatText.ts

import type { ObserverResult, MergeRecord, CellData, Pass2Data } from "./types";

export function formatText(result: ObserverResult): string {
  const lines: string[] = [];

  lines.push(`=== Hungarian Observer: ${result.fixture} ===`);
  lines.push(`Variant count: ${result.variantCount}`);
  lines.push(`Merge order:`);
  result.mergeOrder.forEach((name, i) => {
    lines.push(`  [${i + 1}] ${name}`);
  });
  lines.push("");

  for (const merge of result.merges) {
    formatMerge(merge, lines);
  }

  // Summary
  lines.push("=== Summary ===");
  const stats = collectStats(result);
  lines.push(`Total merges: ${stats.totalMerges}`);
  lines.push(`  Pass 1 definite matches: ${stats.pass1Count}`);
  lines.push(`  Pass 2 Hungarian accepted: ${stats.pass2Accepted}`);
  lines.push(`  Pass 2 Hungarian rejected (threshold): ${stats.pass2Rejected}`);
  lines.push(`  Veto cells: ${stats.vetoCells}`);
  lines.push(`Signal activity:`);
  for (const [name, count] of Object.entries(stats.signalActivity).sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${name}: ${count} non-neutral`);
  }

  return lines.join("\n");
}

function formatMerge(merge: MergeRecord, lines: string[]) {
  const sep = merge.depth === 0
    ? "═".repeat(60)
    : "─".repeat(60);

  lines.push(sep);
  lines.push(`Merge [${merge.index}]: ${merge.path}`);
  if (merge.variantA) {
    lines.push(`  ${merge.variantA} ↔ ${merge.variantB}`);
  }
  lines.push(`  A children: ${merge.childrenACount}  |  B children: ${merge.childrenBCount}`);
  lines.push(sep);
  lines.push("");

  // Pass 1
  if (merge.pass1.length > 0) {
    lines.push("Pass 1 (definite match):");
    for (const m of merge.pass1) {
      lines.push(`  ✓ ${m.aNode.name} (${m.aNode.type}, ${m.aNode.id}) ↔ ${m.bNode.name} (${m.bNode.type}, ${m.bNode.id})  [${m.reason}]`);
    }
    lines.push("");
  } else {
    lines.push("Pass 1: (none)");
    lines.push("");
  }

  // Pass 2
  if (merge.pass2) {
    formatPass2(merge.pass2, lines);
  } else {
    lines.push("Pass 2: (skipped — no free nodes on one or both sides)");
  }
  lines.push("");

  // Sub-merges
  for (const sub of merge.subMerges) {
    formatMerge(sub, lines);
  }
}

function formatPass2(pass2: Pass2Data, lines: string[]) {
  lines.push("Pass 2 (Hungarian cost matrix):");
  lines.push("");

  // Header: columns are A nodes
  const colHeaders = pass2.freeA.map(n => `${n.name}(${n.type.substring(0, 5)})`);
  const colWidth = Math.max(20, ...colHeaders.map(h => h.length + 2));

  // Matrix
  lines.push(`${"".padEnd(25)}${colHeaders.map(h => h.padEnd(colWidth)).join("")}`);
  lines.push(`${"".padEnd(25)}${colHeaders.map(() => "─".repeat(colWidth - 1) + " ").join("")}`);

  for (let ri = 0; ri < pass2.freeB.length; ri++) {
    const bNode = pass2.freeB[ri];
    const rowLabel = `${bNode.name}(${bNode.type.substring(0, 5)})`.padEnd(25);
    const cells = pass2.matrix[ri];

    // Cost row
    const costLine = cells.map(cell => {
      const costStr = cell.cost === Infinity
        ? "Inf ✗"
        : `${cell.cost.toFixed(3)} ${cell.decision === "match" ? "✓" : "✗"}`;
      return costStr.padEnd(colWidth);
    }).join("");
    lines.push(`${rowLabel}${costLine}`);

    // Signal breakdown per cell (indented)
    for (let ci = 0; ci < cells.length; ci++) {
      const cell = cells[ci];
      for (const sig of cell.signals) {
        if (sig.kind === "neutral") continue; // 침묵 신호 생략
        const costField = sig.cost !== undefined
          ? sig.cost.toFixed(3)
          : sig.score !== undefined
            ? `s=${sig.score.toFixed(2)}`
            : "-";
        lines.push(`${"".padEnd(27)}└─ ${sig.signalName}: ${sig.kind} ${costField} — ${sig.reason}`);
      }
    }
    lines.push("");
  }

  // Assignment summary
  lines.push("Assignment:");
  for (const entry of pass2.assignment) {
    const status = entry.accepted ? "✓ ACCEPTED" : "✗ REJECTED (> threshold)";
    lines.push(`  ${entry.aNode.name} ↔ ${entry.bNode.name}  cost=${entry.cost.toFixed(3)}  ${status}`);
  }

  if (pass2.unmatched.length > 0) {
    lines.push(`Unmatched B: ${pass2.unmatched.map(n => n.name).join(", ")}`);
  }
}

interface Stats {
  totalMerges: number;
  pass1Count: number;
  pass2Accepted: number;
  pass2Rejected: number;
  vetoCells: number;
  signalActivity: Record<string, number>;
}

function collectStats(result: ObserverResult): Stats {
  const stats: Stats = {
    totalMerges: 0,
    pass1Count: 0,
    pass2Accepted: 0,
    pass2Rejected: 0,
    vetoCells: 0,
    signalActivity: {},
  };

  function walk(merge: MergeRecord) {
    stats.totalMerges++;
    stats.pass1Count += merge.pass1.length;
    if (merge.pass2) {
      for (const entry of merge.pass2.assignment) {
        if (entry.accepted) stats.pass2Accepted++;
        else stats.pass2Rejected++;
      }
      for (const row of merge.pass2.matrix) {
        for (const cell of row) {
          if (cell.decision === "veto") stats.vetoCells++;
          for (const sig of cell.signals) {
            if (sig.kind !== "neutral") {
              stats.signalActivity[sig.signalName] =
                (stats.signalActivity[sig.signalName] ?? 0) + 1;
            }
          }
        }
      }
    }
    for (const sub of merge.subMerges) {
      walk(sub);
    }
  }

  for (const merge of result.merges) {
    walk(merge);
  }

  return stats;
}
```

- [ ] **Step 2: tsc 확인**

Run: `npx tsc --noEmit 2>&1 | tail -5`
Expected: 에러 없음.

- [ ] **Step 3: Commit**

```bash
git add test/audits/hungarianObserver/formatText.ts
git commit -m "feat(observer): text 모드 포맷터 구현"
```

---

## Task 6: Test entry point + npm script

**Files:**
- Create: `test/audits/hungarianObserver.test.ts`
- Modify: `package.json`

- [ ] **Step 1: test entry point 구현**

```ts
// test/audits/hungarianObserver.test.ts

import { describe, it, expect } from "vitest";
import DataManager from "@code-generator2/layers/data-manager/DataManager";
import { VariantMerger } from "@code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/VariantMerger";
import { createObserverCollector } from "./hungarianObserver/ObserverCollector";
import { formatText } from "./hungarianObserver/formatText";
import fs from "fs";

const fixtureLoaders = import.meta.glob("../fixtures/**/*.json") as Record<
  string,
  () => Promise<{ default: unknown }>
>;

describe("Hungarian Observer", () => {
  it(
    "observes merge decisions for a fixture",
    async () => {
      const fixture = process.env.OBSERVE_FIXTURE;
      const nodeFilter = process.env.OBSERVE_NODE;
      const format = process.env.OBSERVE_FORMAT ?? "text";
      const outPath = process.env.OBSERVE_OUT;

      if (!fixture) {
        process.stdout.write(
          "\nUsage: OBSERVE_FIXTURE=<fixture> npm run audit:observe\n"
        );
        process.stdout.write(
          "Example: OBSERVE_FIXTURE=any/Controlcheckbox npm run audit:observe\n"
        );
        process.stdout.write(
          "Options:\n"
        );
        process.stdout.write(
          "  OBSERVE_NODE=<nodeId>    Filter to merges involving this node\n"
        );
        process.stdout.write(
          "  OBSERVE_FORMAT=text|json Output format (default: text)\n"
        );
        process.stdout.write(
          "  OBSERVE_OUT=<path>       Write to file instead of stdout\n"
        );
        expect(true).toBe(true);
        return;
      }

      const fixturePath = `../fixtures/${fixture}.json`;
      const loader = fixtureLoaders[fixturePath];
      expect(loader, `fixture not found: ${fixture}`).toBeTruthy();

      const mod = (await loader!()) as { default: any };
      const data = mod.default;
      const doc = data?.info?.document;
      expect(doc).toBeTruthy();

      // Observer 설정
      const collector = createObserverCollector(fixture);
      (globalThis as any).__HUNGARIAN_OBSERVER__ = collector;

      try {
        const dm = new DataManager(data);
        const merger = new VariantMerger(dm);
        merger.merge(doc);
      } finally {
        delete (globalThis as any).__HUNGARIAN_OBSERVER__;
      }

      const result = collector.toResult();

      // 출력
      let output: string;
      if (format === "json") {
        output = JSON.stringify(result, null, 2);
      } else {
        output = formatText(result);
      }

      if (outPath) {
        fs.writeFileSync(outPath, output, "utf-8");
        process.stdout.write(`\nOutput written to ${outPath}\n`);
      } else {
        process.stdout.write("\n" + output + "\n");
      }

      // 최소 검증: merge가 하나 이상 수집됐는지
      expect(result.merges.length).toBeGreaterThan(0);
      expect(result.variantCount).toBeGreaterThan(0);
    },
    60_000,
  );
});
```

- [ ] **Step 2: package.json에 script 추가**

package.json의 `scripts` 섹션에 추가 (`audit:trace` 라인 뒤):

```json
"audit:observe": "vitest run test/audits/hungarianObserver.test.ts"
```

- [ ] **Step 3: tsc 확인**

Run: `npx tsc --noEmit 2>&1 | tail -5`
Expected: 에러 없음.

- [ ] **Step 4: 인자 없이 실행 — usage 출력 확인**

Run: `npm run audit:observe 2>&1 | tail -10`
Expected: "Usage: OBSERVE_FIXTURE=<fixture>..." 안내 출력, 테스트 PASS.

- [ ] **Step 5: Commit**

```bash
git add test/audits/hungarianObserver.test.ts package.json
git commit -m "feat(observer): test entry point + npm run audit:observe 스크립트"
```

---

## Task 7: 통합 테스트 — Controlcheckbox smoke test

**Files:** (읽기/실행 전용)

- [ ] **Step 1: Controlcheckbox observer 실행**

```bash
OBSERVE_FIXTURE=any/Controlcheckbox npm run audit:observe 2>&1 | head -80
```

Expected:
- `=== Hungarian Observer: any/Controlcheckbox ===` 헤더
- `Variant count: ` (24 예상)
- `Merge order:` (24개 variant 이름)
- 여러 개의 Merge 블록 (`Merge [1]:`, `Merge [2]:`, ...)
- Pass 1 definite match 기록
- Pass 2 Hungarian cost matrix (cell별 signal 분해)
- `=== Summary ===` (signal activity 통계)

확인 사항:
1. Icon/Normal/Check ↔ Icon/Normal/Line Horizontal 매칭이 어딘가에 나타나는가?
2. Pass 2 matrix에 signal 분해(TypeCompatibility, NormalizedPosition 등)가 보이는가?
3. Summary에 signal activity 통계가 있는가?

- [ ] **Step 2: JSON 모드 테스트**

```bash
OBSERVE_FIXTURE=any/Controlcheckbox OBSERVE_FORMAT=json npm run audit:observe 2>&1 | head -30
```

Expected: JSON 구조 출력 (`{ "fixture": "any/Controlcheckbox", "variantCount": ... }`).

- [ ] **Step 3: 파일 출력 테스트**

```bash
OBSERVE_FIXTURE=any/Controlcheckbox OBSERVE_OUT=/tmp/controlcheckbox-observe.txt npm run audit:observe 2>&1
cat /tmp/controlcheckbox-observe.txt | head -20
```

Expected: 파일에 text 출력이 저장됨.

- [ ] **Step 4: Buttonsolid observer 실행 (큰 fixture)**

```bash
OBSERVE_FIXTURE=failing/Buttonsolid npm run audit:observe 2>&1 | tail -30
```

Expected:
- 출력이 수천 줄이 될 수 있지만 에러 없이 완료
- Summary 통계가 마지막에 나옴
- Interaction↔Wrapper 관련 merge가 포함됨

- [ ] **Step 5: 기존 테스트 regression 확인**

```bash
npm run test 2>&1 | tail -5
```

Expected: baseline과 동일 (120 passed, 5 failed). Observer hook이 observer OFF 상태에서 아무 영향 없음.

---

## Task 8: 검증 + 커밋

- [ ] **Step 1: tsc 확인**

Run: `npx tsc --noEmit 2>&1 | tail -5`
Expected: 에러 없음.

- [ ] **Step 2: 전체 테스트 baseline 일치 확인**

Run: `npm run test 2>&1 | tail -5`
Expected: 120 passed, 5 failed (baseline 동일).

- [ ] **Step 3: git status 확인**

Run: `git status --short`
Expected: 변경/신규 파일 목록.

- [ ] **Step 4: 최종 커밋 (모든 미커밋 변경 포함)**

```bash
git add -A
git commit -m "feat(observer): Hungarian Matrix Observer 도구 완성

Spec B 구현 완료. 주요 구성:
- test/audits/hungarianObserver/ (types, collector, formatText)
- test/audits/hungarianObserver.test.ts (entry point)
- VariantMerger: mergeChildren/mergeTreesInOrder에 observer hook
- NodeMatcher: getDecision() 메서드 추가
- npm run audit:observe 스크립트

사용법:
  OBSERVE_FIXTURE=any/Controlcheckbox npm run audit:observe
  OBSERVE_FIXTURE=failing/Buttonsolid OBSERVE_FORMAT=json npm run audit:observe
  OBSERVE_FIXTURE=any/Controlcheckbox OBSERVE_OUT=before.txt npm run audit:observe

기존 엔진 동작 무변화. observer 비활성 시 0 overhead."
```

---

## 완료 체크리스트

- [ ] Task 1: 타입 정의
- [ ] Task 2: ObserverCollector 구현
- [ ] Task 3: NodeMatcher.getDecision() 추가
- [ ] Task 4: VariantMerger observer hook 삽입 (핵심)
- [ ] Task 5: Text 포맷터
- [ ] Task 6: Test entry point + npm script
- [ ] Task 7: 통합 테스트 (Controlcheckbox + Buttonsolid)
- [ ] Task 8: 검증 + 커밋

---

## Rollback 절차

Task 7/8에서 기존 테스트가 baseline과 달라지면:
1. `mergeChildren`의 observer guard(`if (obs)`)가 false일 때 기존 코드 경로와 동일한지 확인
2. `mergeMatchedNodes`의 `parentDepth` 추가 인자가 기존 호출을 깨뜨리지 않았는지 확인 (optional 파라미터이므로 안전해야 함)
3. 해결 안 되면 `git stash` 또는 `git reset --hard HEAD`

---

## 후속 작업

Spec B 완료 후:
- **Spec C**: 신호 독립성 복원 (NP 단락 제거) — 본 observer 도구로 변경 전후 diff 비교 가능
- **Spec D**: 페어 단언 인프라
- **Spec E**: 범용성 원칙 문서
