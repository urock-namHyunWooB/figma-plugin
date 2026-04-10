# 페어 단언 인프라 설계

**작성일**: 2026-04-10
**상태**: Draft (사용자 검토 대기)
**대상**: `test/audits/`
**선행 작업**: Spec A (엔진 통합), Spec B (observer), Spec C (신호 독립성)

---

## 1. 목표

**한 문장**: fixture별로 "이 두 노드는 같은 슬롯에 합쳐져야/분리돼야 한다"는 정답 라벨을 선언하고, VariantMerger 실행 후 자동 검증하는 테스트 하네스.

### 1.1 왜 필요한가

엔진 설계 원본(§5.5)이 이 인프라를 "엔진 견고성의 유일한 메커니즘"으로 명시:
1. 정답 단언 작성 (어느 노드가 같은 노드여야 하는지 명시)
2. 하네스 실행 → 현재 엔진이 단언을 만족하는지 측정
3. 실패 시 → 어느 신호가 잘못 판단했는지 trace
4. 신호 수정/추가 → 단언 통과 + 기존 회귀 없음 확인

이 루프 없이 신호를 추가하면 2026-04-09 ChildrenShape 실패가 반복됨.

### 1.2 범위 안

1. 단언 데이터 파일 (`assertions.ts`)
2. 검증 로직 (`checker.ts`) — merge 결과에서 pair 합침/분리 확인
3. vitest entry point (`pairAssertions.test.ts`)
4. npm script (`audit:assert`)
5. 초기 단언 4개 (triage에서 확인된 high-confidence 케이스)

### 1.3 범위 밖

- 새 신호 추가 (Spec E)
- 단언의 자동 생성/추천 (수동 선언만)
- audit/anomaly baseline 변경

---

## 2. 설계

### 2.1 파일 구조

```
test/audits/
├── pairAssertions.test.ts           # vitest entry point
└── pairAssertions/
    ├── assertions.ts                # 정답 라벨 데이터
    └── checker.ts                   # merge 결과에서 pair 검증
```

### 2.2 단언 데이터 형식

```ts
// test/audits/pairAssertions/assertions.ts

export interface PairAssertion {
  /** 원본 variant의 노드 ID (mergedNodes에서 찾을 ID) */
  nodeA: string;
  /** 원본 variant의 노드 ID */
  nodeB: string;
  /** true: 같은 InternalNode에 합쳐져야 함, false: 다른 InternalNode여야 함 */
  shouldMatch: boolean;
  /** 사람이 읽는 설명 (실패 시 출력) */
  description: string;
}

export interface FixtureAssertions {
  fixture: string;
  pairs: PairAssertion[];
}

export const pairAssertions: FixtureAssertions[] = [
  {
    fixture: "any/Controlcheckbox",
    pairs: [
      {
        nodeA: "16215:34466",   // Icon/Normal/Check (State=Checked variant)
        nodeB: "16215:34471",   // Icon/Normal/Line Horizontal (State=Indeterminate variant)
        shouldMatch: true,
        description: "같은 아이콘 슬롯 — State에 따라 다른 아이콘이 교체되는 정상 패턴",
      },
    ],
  },
  {
    fixture: "any-component-set/airtable-button",
    pairs: [
      {
        nodeA: "15:45",         // Label (primary/default variant)
        nodeB: "15:68",         // Secondary (secondary variant)
        shouldMatch: true,
        description: "같은 텍스트 요소 — 디자이너가 variant별로 이름만 다르게 붙인 legit rename",
      },
    ],
  },
  {
    fixture: "button/Btnsbtn",
    pairs: [
      {
        nodeA: "4214:393",      // icon_arrow (default variant의 아이콘 인스턴스)
        nodeB: "4214:548",      // icon_delete (loading variant의 다른 아이콘 인스턴스)
        shouldMatch: false,
        description: "다른 아이콘 — arrow와 delete는 별개 요소, 합치면 안 됨",
      },
      {
        nodeA: "I4214:393;3:315",   // Vector 40 (icon_arrow 내부 벡터)
        nodeB: "I4214:453;3:481",   // Rectangle 419 (icon_wastebasket 내부 사각형)
        shouldMatch: false,
        description: "다른 도형 — 아이콘 내부 벡터/사각형은 별개 요소",
      },
    ],
  },
];
```

### 2.3 검증 로직

```ts
// test/audits/pairAssertions/checker.ts

/**
 * merge 결과 트리에서 특정 nodeId가 속한 InternalNode를 찾는다.
 * mergedNodes 배열에 해당 ID가 있는 InternalNode를 반환.
 */
function findMergedHost(tree: InternalTree, nodeId: string): InternalNode | null

/**
 * 단언을 검증하고 결과를 반환.
 */
function checkAssertion(tree: InternalTree, assertion: PairAssertion): {
  passed: boolean;
  detail: string;  // 실패 시: "expected match but found in different hosts" 등
}
```

검증 방법:
- `shouldMatch: true` → nodeA와 nodeB가 **같은** InternalNode의 mergedNodes에 있어야 함
- `shouldMatch: false` → nodeA와 nodeB가 **다른** InternalNode에 있어야 함 (또는 한쪽이 못 찾아짐)

### 2.4 Test entry point

```ts
// test/audits/pairAssertions.test.ts

// 각 fixture별로 describe 블록 생성
// 각 pair별로 it 블록 생성
// fixture 로드 → DataManager → VariantMerger.merge() → checker로 검증
```

### 2.5 npm script

```json
"audit:assert": "vitest run test/audits/pairAssertions.test.ts"
```

### 2.6 출력 형식 (실패 시)

```
✗ button/Btnsbtn: icon_arrow ↔ icon_delete — 다른 아이콘, 합치면 안 됨
  Expected: shouldMatch=false (분리)
  Actual: MATCHED (같은 host node 4214:393에 합쳐져 있음)
  → 현재 엔진이 이 pair를 잘못 합치고 있음
```

---

## 3. 초기 단언 세트 (4개)

| # | Fixture | 노드 A | 노드 B | 기대 | 현재 엔진 |
|---|---|---|---|---|---|
| 1 | Controlcheckbox | `16215:34466` Check | `16215:34471` Line Horizontal | **match** | ✓ (이미 합침) |
| 2 | airtable-button | `15:45` Label | `15:68` Secondary | **match** | ✓ (이미 합침) |
| 3 | Btnsbtn | `4214:393` icon_arrow | `4214:548` icon_delete | **no match** | ? (triage에서 합쳐진 것 확인됨 — 현재 FAIL 예상) |
| 4 | Btnsbtn | `I4214:393;3:315` Vector 40 | `I4214:453;3:481` Rectangle 419 | **no match** | ? (합쳐진 것 확인됨 — 현재 FAIL 예상) |

**#3, #4는 현재 엔진에서 FAIL이 예상됨** — 이건 정상. "엔진이 현재 이 케이스를 잘못 판단하고 있다"는 것을 정량적으로 보여주는 게 단언의 가치. 향후 cross-name 신호(Spec E)가 이 FAIL을 PASS로 바꿀 것.

---

## 4. 성공 기준

1. `npm run audit:assert` 실행 시 4개 단언의 pass/fail 결과 출력
2. #1, #2는 PASS (현재 엔진이 올바르게 합침)
3. #3, #4는 FAIL (현재 엔진의 알려진 한계 — 이건 의도된 기록)
4. 새 단언 추가 = `assertions.ts`에 객체 1개 추가. 다른 파일 변경 불필요.
5. 기존 테스트/audit baseline에 영향 없음

---

## 5. 영향 받는 파일

**신규**:
- `test/audits/pairAssertions.test.ts`
- `test/audits/pairAssertions/assertions.ts`
- `test/audits/pairAssertions/checker.ts`

**수정**:
- `package.json` — `audit:assert` script 추가

**변경 없음**: 엔진 코드 전체

---

## 6. 후속 작업

- **Spec E**: cross-name 대응 신호 — 단언 #3, #4를 PASS로 바꾸는 신호 개발 (TDD: 단언 먼저 → 신호 구현 → 단언 PASS 확인)
