# Cross-name 매칭 작업 — Spec 2 Handoff 노트

> **2026-04-09 작업 종료 시 작성. 다음 세션에서 cross-name 매칭 작업 재개 시 이 문서를 가장 먼저 읽으세요.**
>
> 전날 한 번의 큰 시도 실패 → 분리 접근 → Spec 1(PSI 제거) 완료 → Spec 2(cross-name 재시도) 대기. 이전 실패 교훈과 금지사항, 권장 접근 후보 A~E 포함.

---

## 작업 맥락

Variant Merger의 cross-name container 매칭 문제(Wrapper↔Interaction 등)를 줄이려는 작업. 현재 `anomaly-baseline.json` 기준 **cross-name 119건** (dev).

2026-04-09에 한 번의 큰 시도가 실패하여 branch 폐기, 분리 접근으로 재시작했습니다. Spec 1(PSI 단독 제거)은 안전하게 완료되었고, Spec 2(실제 cross-name 감소)는 신중한 재설계가 필요한 상태입니다.

---

## 진행 상태

### Spec 1: PSI 단독 제거 ✅ 완료 (dev merged)

**Commit**: `16b58d0 refactor(match-engine): ParentShapeIdentity 등록 해제`

**변경**: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/index.ts`에서 PSI import + 배열 entry 제거. 클래스 파일은 남겨둠.

**실측 결과**:
- audit: 1856 → 1856 (+0)
- anomaly: 119 → 119 (+0)
- match-engine tests: 72 passed, 5 skipped

**가설 확정**: dev에서 NP가 container pair에 `decisive-match-with-cost`로 short-circuit하므로 PSI는 실질적으로 실행 안 됐음. 제거해도 영향 없음. PSI는 실제로 dead signal이었음.

**중요한 주의사항**: 이 결과는 **NP가 현재처럼 decisive하게 동작할 때만** 유효. NP를 강등하면 PSI 자리가 비어 1723건 회귀 폭발 (이전 시도에서 실측). Spec 2에서 NP 강등을 고려한다면 이 점 반드시 기억.

### Spec 2: cross-name 매칭 — 대기 중

목표: Variant Merger가 이름이 다른 컨테이너(예: `Wrapper`↔`Interaction`)를 같은 노드로 매칭하는 문제 감소. 목표 숫자 미정 (이전 목표 "119 → 5 이하"는 ChildrenShape 시뮬레이션 기반이었음, 재검토 필요).

---

## 이전 실패 (2026-04-09 폐기된 시도)

**폐기된 branch**: `2026-04-09-children-shape-signal` (at ae235ac, 6 commits, worktree/branch 모두 삭제)

**시도했던 변경 (모두 폐기)**:
1. ChildrenShape signal 도입 (container pair 자식 개수·type 차이 → cost)
2. NormalizedPosition container pair에서 `decisive-match-with-cost` → `match-with-cost` 강등
3. PSI 등록 해제 (Spec 1으로 분리돼서 이것만 살아남음)

**실측 실패**:
- audit: 1856 → 1958 (+102), 모든 fixture 악화
- `Controlcheckbox`: **0 → 17** (멀쩡하던 fixture가 망가짐)
- `SegmentedControl`: **0 → 6** (동일)
- `Primary`: 2 → 19, `taptapButton`: 2 → 19, `Switchswitch`: 6 → 18
- `primaryStatePseudo` test 실패 (x좌표 기반 자식 정렬 깨짐 — 실제 UI 망가짐)
- 7건 compiler/tree-builder tests 실패

**폐기된 spec/plan (dev에 기록 보존)**:
- `docs/superpowers/specs/2026-04-09-children-shape-signal-design.md`
- `docs/superpowers/plans/2026-04-09-children-shape-signal.md`

---

## 핵심 교훈 (Spec 2 시작 전 반드시 이해할 것)

### 1. PSI는 "의미 없는 신호"가 아니라 암묵적 threshold tightener였다

container pair마다 score 0.5(부모 type만 일치 케이스)를 뿌려 Hungarian cost matrix에 global floor를 제공했었음. 애매한 pair를 cutoff하던 disambiguator. NP의 short-circuit 때문에 평소에는 호출 안 돼서 문제가 안 드러남. **NP를 강등하면 PSI가 깨어나고 매칭 매트릭스가 오염됨**.

Spec 1에서 PSI 제거했는데도 영향 없었던 이유: NP가 여전히 short-circuit 중이라 PSI는 애초에 거의 실행 안 됐기 때문. **PSI의 "숨은 disambiguator 효과"는 NP가 fallback 모드일 때만 활성화됨**.

### 2. ChildrenShape 공식이 너무 조잡했음

`0.5 × |lenA - lenB| / max(lenA, lenB) + 0.5 × typeDiff`. 자식 이름/순서/depth 반영 없음. count + type만. 이걸로는 PSI가 제공하던 global floor 역할 대체 불가. **공식 재설계가 필요하다면 count/type 이상의 정보를 반영해야 함**.

### 3. "baseline 수용" 접근이 부정확했음

`primaryStatePseudo` 같은 e2e test가 x좌표 정렬 실패한 건 "원래 드러났어야 했던 버그"가 아니라 **변경이 새로 만든 regression**. dev 비교 검증으로 확정 (Primary 2→19, 모든 fixture 악화, decrease 0).

교훈: "baseline이 오염됐으니 수용하자"는 접근은 위험. **반드시 dev 비교 + snapshot/e2e 검증 병행**.

### 4. `matchTrace` 도구의 한계

단일 pair의 신호 결정은 보여주지만 Hungarian matrix 전역에서 그 pair가 왜 선택/거부됐는지는 못 보여줌. 이전 시도에서 "엔진은 match 결정했는데 audit은 disjoint"인 케이스 원인 불명. **Spec 2 시작 전 Hungarian matrix 관찰 도구가 필요할 수 있음**.

### 5. ChildrenShape는 cross-name을 잡지 못한다 (이전 시도 실측)

이전 시뮬레이션에서는 자식 구조 점수가 "container hit 31건 중 31건 감소"로 예상됐지만, 실제 엔진에 등록하니 다른 pair 매칭을 망가뜨리고 cross-name은 오히려 늘어남 (119 → 149). **ChildrenShape 접근 자체가 잘못된 방향일 가능성 고려**.

---

## Spec 2 시작 전 금지사항 (반드시 지킬 것)

- ❌ **NP container pair 강등과 ChildrenShape 추가를 한 번에 하지 말 것.** 같은 실패 반복.
- ❌ **PSI 되살리지 말 것.** Spec 1으로 제거 완료. "PSI가 뭔가 잡고 있었나?"는 이미 답 나옴 — 잡는 게 아니라 약한 매칭을 컷오프하는 부수 효과.
- ❌ **single pair `matchTrace`만 보고 가설 세우지 말 것.** Hungarian 전역을 봐야 함.
- ❌ **"baseline 수용 = 품질 저하 감춤" 접근 금지.** 실측 dev 비교로 검증.
- ❌ **ChildrenShape(count+type) 공식 그대로 재시도 금지.** 공식 자체가 불충분하다는 게 증명됨.
- ❌ **큰 변경 여러 개 한 번에 금지.** 하나씩 측정하며 진행.

---

## Spec 2 권장 초기 접근 후보 (사용자 결정 필요)

### A. Hungarian matrix 관찰 도구부터 만들기

Spec 2 본 작업 전 선행 도구. 특정 fixture + 특정 variant pair에 대해:
- 전체 Hungarian cost matrix 덤프
- 선택된 assignment 강조
- 각 cell의 신호별 cost 분해
- "이 pair가 선택된 이유 / 저 pair가 거부된 이유" 명시

이 도구 없이는 이번처럼 "엔진은 match인데 audit은 disjoint" 케이스 원인 불명. 2~4시간 작업 예상.

**장점**: Spec 2 시도 전 정확한 이해 가능. 이후 모든 작업의 기반 도구.
**단점**: 본 작업이 아니라 sub-task. 사용자 인내심 필요.

### B. VariantPropPosition 가드 완화 시도 (다른 pre-existing 회귀부터)

별도 memory/문서에 있는 19건+ 회귀 중 `variant-prop-position` 20건. VPP 신호의 `isBooleanValue` 가드 완화 시도. Left/Right Icon swap 3건(Primary, taptapButton)도 이 범주. ChildrenShape와 무관한 방향.

**장점**: cross-name 문제와 완전 분리. 실패해도 쉽게 revert. 빨리 성과.
**단점**: cross-name(119건) 자체는 감소 안 함. 별개 개선.

### C. 자식 구조를 NormalizedPosition 안에 inline

NP 강등 없이, NP 내부에서 container pair cost 계산 시 자식 구조 차이도 함께 고려. NP가 여전히 `decisive-match-with-cost`를 반환하므로 PSI 재발동 위험 없음. ChildrenShape signal class 폐기.

**장점**: 이전 실패 원인(신호 분리로 인한 부작용) 회피.
**단점**: NP가 복잡해짐. 공식 설계 여전히 어려움 (count+type이 부족하다는 교훈은 그대로).

### D. 이름 기반 disambiguator 신호

"같은 변형의 같은 구조적 위치 = 같은 이름이어야 한다"는 관찰. container pair가 이름이 다르면 cost 추가. 이 접근은 **자식 구조가 아닌 노드 자체의 이름**에 집중. 단 같은 구조인데 다른 이름(Label↔Secondary 같은 legitimate rename)을 어떻게 허용할지가 어려움.

**장점**: 직접적. cross-name 문제를 이름으로 해결.
**단점**: legitimate rename을 구분하는 게 어려움. false positive 위험.

### E. Spec 2 포기 + 다른 회귀 우선순위

cross-name 119건은 audit pattern 분류상 "different-name"으로 잡혀 있고, 이 중 일부는 legitimate rename이고 일부만 진짜 버그. **진짜 버그인 케이스가 얼마나 되는지** 수동 검증 없이는 모름. 다른 우선순위 높은 회귀(same-name-same-type 7건 등)가 먼저일 수도.

**장점**: 확실한 회귀부터 해결.
**단점**: cross-name 문제는 그대로 남음.

---

## 다음 세션 체크리스트

1. **이 문서 전체 읽기**
2. 현재 dev 상태 확인:
   ```bash
   git log --oneline -5
   npm run audit        # 1856 유지 확인 (다른 작업으로 바뀌었을 수 있음)
   npm run audit:anomaly # 119 유지 확인
   ```
3. 사용자에게 Spec 2 초기 접근 중 어느 것으로 갈지 (A/B/C/D/E) 질문
4. 선택된 접근에 따라 brainstorming 사이클 시작 (spec → plan → implementation)
5. **모든 큰 변경은 반드시 dev 비교 `audit:diff`로 실측 후 진행**. 가설만 믿지 말 것.

---

## 진실의 원천 (참고 자료)

- `test/audits/audit-baseline.json` — dev 기준 1856 (Spec 1 이후에도 유지)
- `test/audits/baselines/anomaly-baseline.json` — dev 기준 119 (동일)
- 엔진 회귀 분석 도구: `npm run audit:diff`, `audit:anomaly`, `audit:trace`, `audit:write`, `audit:anomaly:write`
- `docs/guide/8-workflow/regression-analysis.md` — 회귀 분석 워크플로우 가이드
- 엔진 설계 원본: `docs/superpowers/specs/2026-04-08-variant-merger-engine-design.md`
- 이전 폐기된 시도의 spec/plan (참조용, 교훈용):
  - `docs/superpowers/specs/2026-04-09-children-shape-signal-design.md`
  - `docs/superpowers/plans/2026-04-09-children-shape-signal.md`
