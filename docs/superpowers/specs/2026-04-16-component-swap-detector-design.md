# Component Swap Detector — 설계 문서

**작성일**: 2026-04-16
**대상**: VariantMerger 회귀 — INSTANCE swap variant 패턴 미처리
**참조 메모리**: `project_instance_swap_variant_pattern.md`, `feedback_detector_responsibility.md`

---

## 1. Problem

Figma COMPONENT_SET의 일부 디자인 패턴은 variant prop value별로 **같은 슬롯에 다른 mainComponent를 swap**한다. 디자이너가 Active=False용·True용 컴포넌트를 별도 마스터로 만들어 갈아끼우는 경우 등.

현재 엔진은 이 패턴을 인식하는 detector가 없다. VariantMerger는 두 다른 INSTANCE를 서로 다른 노드로 보고 매칭에 실패하며, 결과적으로 그 자식들도 disjoint pair로 분리되어 generated React 코드에 중복이 발생한다.

**진단 근거**:
- Switchswitch fixture의 disjoint pair (Knob ↔ Knob)는 NodeMatcher 단일 pair trace에선 `BooleanPositionSwap`이 match로 결정하지만 audit baseline엔 disjoint로 등록.
- Hungarian observer 결과 자식 Knob은 cost=0으로 ACCEPTED. 즉 매칭 실패 지점은 **부모 INSTANCE 레벨**.
- 부모 `16215:34985`(name="Switch")의 자식 INSTANCE 두 개가 같은 이름이지만 componentId가 다름 (`16308:159753` ↔ `16308:159754`).
- DesignPatternDetector 8가지 패턴 어디에도 매칭되지 않음.

**범위 검증** (88개 fixture 직접 스캔):
- Same-name swap (Switchswitch 형태): **30건** (10개 fixture).
- Different-name swap: **0건**.
- 영향 fixture: `failing/SegmentedControl`, `failing/SelectButtons`, `failing/SelectionControled`, `failing/Textinputtextfield`, `item-slot-likes/airtable-select-button`, `select-button/airtable-select-button`, `any/Switchswitch`, `any/InputBoxotp`, `any/error-02`, `button/tadaButton`, `regression/BreakpointdesktopmdlgStatelogin`.

---

## 2. Goals

1. INSTANCE swap variant 패턴을 정확히 식별해서 VariantMerger가 해당 두 INSTANCE를 같은 InternalNode로 매칭하도록 한다.
2. 책임 분리 원칙 준수: detector는 raw 데이터에서 패턴 식별만, signal은 metadata 읽고 cost 결정만.
3. 회귀(disjoint pair) 감소를 audit:diff로 측정하여 검증.
4. false positive 0 유지 — 진짜 별개 INSTANCE를 swap으로 잘못 합치지 않는다.

## 3. Non-Goals

- 이름이 다른 swap 케이스 처리 (현재 fixture에 0건. 미래 등장 시 별도 작업).
- BooleanPositionSwap의 패턴 감지 책임 분리 리팩토링 (별도 작업으로 메모리에 기록됨).
- VariantMerger의 다른 회귀(VPP 가드 완화, cross-name 등)은 별도 spec.

---

## 4. Architecture

```
DesignPatternDetector
  └─ detectComponentSwap()        ← NEW. raw SceneNode 분석, 패턴 식별
        ↓
  pattern { type: "componentSwap", containerNodeId, prop, swappedInstances }
        ↓ (VariantMerger.applyDesignPatterns로 InternalNode metadata에 복사)
        ↓
VariantMerger NodeMatcher pipeline
  └─ ComponentSwap signal         ← NEW. metadata.designPatterns 읽기, cost 결정
        ↓
  decisive-match-with-cost (0.05) — 두 INSTANCE를 같은 노드로 매칭
```

책임 분리:
- **detector** = 패턴이 있는지 식별, raw 데이터에서.
- **signal** = 식별된 패턴을 NodeMatcher에 신호로 전달.

매칭 휴리스틱(크기, 위치, 부모 모양 등)은 어디에도 들어가지 않는다 — detector가 패턴이라고 식별했다면 그 자체로 신뢰.

---

## 5. DesignPatternDetector 변경

### 5.1 새 패턴 타입

`src/frontend/ui/domain/code-generator2/types/types.ts`의 `DesignPattern` 유니언에 추가:

```typescript
| {
    type: "componentSwap";
    containerNodeId: string;       // swap이 발생한 부모 컨테이너 nodeId
    prop: string;                  // swap을 결정하는 variant prop 이름 (정규화된)
    swappedInstances: Record<string, string>; // prop value → INSTANCE nodeId
  }
```

`containerNodeId`는 swap이 발생하는 컨테이너 (variant root에서 path를 가지는 부모). `prop`은 swap을 결정하는 variant prop. `swappedInstances`는 prop value별 sample INSTANCE nodeId (모든 variant의 모든 ID를 담지 않고, 각 prop value당 대표 INSTANCE 하나).

### 5.2 detect 메서드

`DesignPatternDetector.detect()`의 COMPONENT_SET 분기에 component-level 패턴으로 등록:

```typescript
if (node.type === "COMPONENT_SET") {
  // ... 기존 로직 ...
  this.detectComponentSwap(variants, propDefs, patterns);
}
```

### 5.3 detectComponentSwap 알고리즘

입력: variants (COMPONENT_SET children), propDefs.

```
1. variants 각각에 대해, 자식 트리 순회하며 INSTANCE 노드 수집:
   - 키: variant 자식부터의 name path (variant 이름 제외)
   - 값: { nodeId, name, componentId }
   - 첫 등장만 기록 (path 충돌 시 무시)

2. 모든 path 합집합 계산.

3. 각 path에 대해:
   a. variant별로 해당 path INSTANCE 조회.
   b. 모든 variant에 존재하지 않으면 skip (조건부 노드는 swap 후보 아님).
   c. componentId 집합이 단일 값이면 skip (swap 아님).
   d. name 집합이 단일 값이 아니면 skip (다른 이름은 본 spec 범위 밖).

4. componentId 차이를 결정하는 variant prop 식별:
   - propDefs에서 type=VARIANT인 모든 prop을 후보로 검토.
   - 각 prop에 대해, "같은 prop value를 가진 variants는 항상 같은 componentId"인지 확인.
   - 정확히 하나의 prop만 이 조건을 만족하면 그 prop이 swap 결정자.
   - 0개 또는 2개 이상이면 skip (단일 prop으로 결정되지 않는 복합 swap은 본 spec 범위 밖).

5. 패턴 등록:
   {
     type: "componentSwap",
     containerNodeId: <swap 발생 컨테이너 nodeId>,
     prop: <정규화된 prop 이름>,
     swappedInstances: <prop value → 대표 nodeId 매핑>
   }
```

`containerNodeId`는 path의 마지막 segment 직전까지 따라가서 얻은 컨테이너의 nodeId. 첫 variant에서 조회.

### 5.4 패턴 정의 조건 (가드 아닌 정의)

detector 안에 들어가는 조건은 **패턴 자체의 정의**:
- type=INSTANCE
- name 일치 (모든 variant)
- 모든 variant에 path 존재
- componentId가 variant 간 다름
- 단일 variant prop으로 swap 결정 가능

매칭 휴리스틱(크기·위치·부모 자식 개수 등)은 **들어가지 않는다**.

---

## 6. NodeMatcher Signal 변경

### 6.1 새 신호 클래스

`src/.../match-engine/signals/ComponentSwap.ts`:

```typescript
export class ComponentSwap implements MatchSignal {
  readonly name = "ComponentSwap";

  evaluate(a: InternalNode, b: InternalNode, ctx: MatchContext): SignalResult {
    const aPatterns = a.metadata?.designPatterns ?? [];
    const bPatterns = b.metadata?.designPatterns ?? [];

    // 두 노드가 같은 componentSwap 패턴의 swappedInstances에 모두 포함되는지 확인
    for (const ap of aPatterns) {
      if (ap.type !== "componentSwap") continue;
      for (const bp of bPatterns) {
        if (bp.type !== "componentSwap") continue;
        if (ap.containerNodeId !== bp.containerNodeId) continue;
        if (ap.prop !== bp.prop) continue;

        const aIds = new Set(Object.values(ap.swappedInstances));
        const bIds = new Set(Object.values(bp.swappedInstances));
        const aMergedIds = a.mergedNodes?.map(m => m.id) ?? [];
        const bMergedIds = b.mergedNodes?.map(m => m.id) ?? [];

        const aMatch = aMergedIds.some(id => aIds.has(id));
        const bMatch = bMergedIds.some(id => bIds.has(id));

        if (aMatch && bMatch) {
          return {
            kind: "decisive-match-with-cost",
            cost: 0.05,
            reason: `componentSwap pair (prop=${ap.prop}, container=${ap.containerNodeId})`,
          };
        }
      }
    }

    return { kind: "neutral", reason: "not a componentSwap pair" };
  }
}
```

`decisive-match-with-cost` 0.05는 BooleanPositionSwap과 동일 — Hungarian이 ties를 만들지 않도록.

**감지 로직 없음**. 오직 metadata 읽고 매칭 cost 반환.

### 6.2 신호 등록

`src/.../match-engine/index.ts`의 신호 배열에 ComponentSwap 추가. 등록 순서는 다른 신호와의 우선관계를 검토 — 기본은 IdMatch / TypeCompatibility 다음, NormalizedPosition 전후.

### 6.3 metadata 전파

VariantMerger.applyDesignPatterns가 component-level 패턴을 root에 등록하므로, ComponentSwap signal은 swap 대상 INSTANCE의 metadata가 아닌 **그 두 INSTANCE의 mergedNodes id**가 swappedInstances에 포함되는지로 매칭. 따라서 별도 propagation 작업 불필요.

다만 detect 시점에 node-level 패턴으로 변환할지 component-level만 둘지는 구현 단계 결정 — node-level이면 swap 대상 INSTANCE node에 직접 metadata 부착, signal 로직이 더 단순. 두 옵션 모두 책임 분리 원칙 만족.

권장: **node-level 부착** — swap 대상 INSTANCE 두 개 모두에 동일한 패턴 객체 부착. signal에서 단순히 "양쪽 노드에 같은 componentSwap 패턴이 있는가" 검사.

---

## 7. Test Plan

### 7.1 단위 테스트

`test/compiler/design-pattern-detector.test.ts`에 테스트 추가:

1. **단일 prop swap** — 두 variant, 같은 path에 같은 이름 INSTANCE, 다른 componentId, 단일 prop diff → componentSwap 등록.
2. **복합 prop swap** — 여러 prop이 동시에 다르면 swap 결정 prop이 모호하므로 등록 안 함.
3. **이름 다른 INSTANCE** — 등록 안 함.
4. **조건부 INSTANCE** (일부 variant에만 존재) — 등록 안 함.
5. **componentId 동일** — swap이 아니므로 등록 안 함.

### 7.2 신호 테스트

`test/.../match-engine/ComponentSwap.test.ts`:

1. metadata에 componentSwap 패턴 있고 mergedNodes id가 swappedInstances 양쪽에 포함 → decisive-match-with-cost 0.05.
2. metadata에 패턴 없음 → neutral.
3. 패턴은 있지만 다른 컨테이너 — neutral.
4. 패턴은 있지만 mergedNodes id가 swappedInstances에 없음 — neutral.

### 7.3 회귀 검증

- `npm run audit` — 회귀 게이트 통과.
- `npm run audit:diff` — 새 회귀 0, 해소된 회귀 측정.
- `npm run audit:anomaly` — anomaly 변화 측정.
- 영향 fixture 11개의 snapshot diff 수동 검증 — 의미적으로 올바른지 확인.
- 기존 BooleanPositionSwap 발동 fixture(Switchswitch, Toggle, taptap-navigation)에서 기존 매칭이 깨지지 않는지 확인.

### 7.4 측정 목표

- audit-baseline.json `totalDisjointPairs` 1837 → 감소 (정확한 수치는 implementation 후 측정).
- anomaly-baseline.json `cross-name` 76 → 감소 (cross-name 일부가 INSTANCE swap의 부수효과일 가능성).
- 새 회귀 0건.

---

## 8. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Detector가 진짜 별개 INSTANCE를 swap으로 잘못 식별 | name·componentId·variant prop 단일 결정 가드. 명시적 false positive 테스트. |
| 신호 cost 0.05가 다른 신호와 충돌 | BooleanPositionSwap 동일 cost — 이미 검증된 값. |
| 이름 다른 swap 등장 시 누락 | 본 spec 범위 밖. 미래 fixture 등장 시 별도 작업. |
| BooleanPositionSwap과 중복 발동 | ComponentSwap이 decisive면 후속 신호 skip. 충돌 가능성 낮음. 테스트로 검증. |
| 복합 prop swap (Active=False & Disable=True 동시 분기) 누락 | 본 spec 범위 밖. 단일 prop swap만 처리. 등장 시 별도. |

---

## 9. 작업 순서

implementation plan은 별도 문서로. 대략적 순서:

1. Type 정의 (`DesignPattern` 유니언에 `componentSwap` 추가).
2. DesignPatternDetector.detectComponentSwap 구현 + 단위 테스트.
3. ComponentSwap signal 구현 + 단위 테스트.
4. match-engine에 신호 등록.
5. audit:diff로 회귀 측정.
6. snapshot 업데이트 (의미 검증 후).
7. baseline 갱신 (의도된 변화 확인 후).

각 단계는 별도 commit. 단계 사이 dev 비교 audit 실측 필수 (메모리 `project_children_shape_signal_wip.md`의 "큰 변경 한 번에 금지" 원칙).

---

## 10. 진실의 원천

- `src/.../processors/DesignPatternDetector.ts` — 기존 detector 구현
- `src/.../processors/variant-merger/match-engine/signals/BooleanPositionSwap.ts` — 신호 패턴 참조 (단 패턴 감지 로직 부분은 본 spec과 책임 분리 원칙이 다름 — 미래 리팩토링 대상)
- `src/.../types/types.ts` — DesignPattern 유니언
- `test/audits/audit-baseline.json`, `test/audits/baselines/anomaly-baseline.json` — 회귀 측정 baseline
- `docs/guide/8-workflow/regression-analysis.md` — 회귀 측정 워크플로우
