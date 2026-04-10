# Variant Merger 엔진 통합 (파일 재배치) 설계

**작성일**: 2026-04-10
**상태**: Draft (사용자 검토 대기)
**대상**: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/`
**선행 문서**:
- `docs/superpowers/specs/2026-04-08-variant-merger-engine-design.md` (엔진 설계 원본)
- `docs/superpowers/specs/2026-04-10-hungarian-observation-tool-design.md` (Spec B, 본 spec 완료 후 착수)

---

## 1. 배경

현재 `processors/` 디렉토리에 Variant Merger 엔진 관련 파일 6개가 다른 무관한 processor 8개와 뒤섞여 있다. "엔진 수준으로 고도화" 작업(신호 독립성 복원, 페어 단언, 관찰 도구 등)을 하기 전에 **엔진을 하나의 명확한 모듈로 경계짓는 선행 작업**이 필요하다.

### 1.1 현재 상태 (2026-04-10 기준)

`processors/` 디렉토리 구성:

```
processors/
├── ExternalRefsProcessor.ts       ← 엔진 무관
├── InstanceSlotProcessor.ts       ← 엔진 무관
├── InteractionLayerStripper.ts    ← 엔진 무관
├── LayoutNormalizer.ts            ← 엔진 (위치 정규화, signal들이 사용)
├── NodeMatcher.ts                 ← 엔진 (MatchDecisionEngine 호출 래퍼)
├── PropsExtractor.ts              ← 엔진 무관
├── SlotProcessor.ts               ← 엔진 무관
├── StyleProcessor.ts              ← 엔진 무관
├── TextProcessor.ts               ← 엔진 무관
├── UpdateSquashByIou.ts           ← 엔진 (post-merge squash)
├── VariantGraphBuilder.ts         ← 엔진 (merge 순서 결정)
├── VariantMerger.ts               ← 엔진 (메인 오케스트레이터)
├── VisibilityProcessor.ts         ← 엔진 무관
├── match-engine/                  ← 엔진 (매칭 결정 서브모듈)
│   ├── MatchDecisionEngine.ts
│   ├── MatchingPolicy.ts
│   ├── MatchSignal.ts
│   ├── index.ts
│   └── signals/ (10개 신호 파일)
└── utils/                         ← 엔진 무관 (slot, override 등)
```

엔진 파일 6개 (`LayoutNormalizer`, `NodeMatcher`, `UpdateSquashByIou`, `VariantGraphBuilder`, `VariantMerger`, `match-engine/`)가 엔진 무관 파일 8개 + utils/와 같은 폴더에 평탄 배치돼 있다.

### 1.2 문제

1. **경계 모호** — "엔진에 속한 파일이 무엇인지" 폴더 구조로 구분 안 됨. 새로 합류하는 사람이 파일명만 보고 엔진 소속 여부 판단 어려움.
2. **공개 API 부재** — TreeBuilder 같은 외부 소비자가 `VariantMerger.ts`를 직접 deep import. 엔진의 공개 표면이 없어서 "어떤 게 외부에서 써도 되는 API이고 어떤 게 내부 구현인지" 구분 안 됨.
3. **후속 작업의 범위 퍼짐** — Hungarian 관찰 도구(Spec B)가 `VariantMerger.ts`에 훅을 추가해야 하는데, 엔진 경계가 없으면 "훅이 엔진 안쪽인지 바깥쪽인지" 모호. 신호 독립성 복원(Spec C)도 마찬가지.
4. **네이밍 일관성 결여** — `UpdateSquashByIou.ts`는 메서드 동작 문구이지 클래스 이름이 아님. 옆 파일(`VariantMerger`, `VariantGraphBuilder`)의 명사형 네이밍과 불일치.

---

## 2. 목표

**한 문장**: 엔진 파일 6개를 `processors/variant-merger/` 단일 디렉토리로 통합하고, `UpdateSquashByIou`를 `VariantSquasher`로 리네임하고, 공개 API를 `variant-merger/index.ts`로 정의한다. **Behavior 변화 0.**

### 2.1 범위 안

1. **파일 재배치**: 엔진 파일 6개를 `variant-merger/` 하위로 이동
2. **네이밍 수정 1건**: `UpdateSquashByIou.ts` + 클래스 이름 → `VariantSquasher.ts` + `VariantSquasher` 클래스
3. **공개 API barrel**: `variant-merger/index.ts` 생성, `VariantMerger`만 export (외부 소비자가 필요한 유일 심볼)
4. **import 경로 업데이트**: 영향 받는 ~22개 파일 (내부 파일 4 + 외부 소비자 1 + test 17)

### 2.2 범위 밖 (후속 spec으로 이관)

- **엔진 동작 변경 금지** — 신호 등록/순서/가중치/임계값 일체 수정 안 함
- **`NodeMatcher` 제거** — 엔진 설계 원본 §3.3의 "isSameNode/getPositionCost/isDefiniteMatch 통합"은 behavior 경계 건드림 → Spec C
- **`VariantSquasher` → 엔진 호출 통합** — 엔진 설계 §3.5의 squash 통합은 별도 작업 → Spec C 또는 별도
- **`match-engine/` 이름 변경** — 이미 문서에서 공식 용어로 사용 중 → 그대로
- **죽은 signal 파일 삭제** — `WrapperRoleDistinction`, `ParentShapeIdentity`, `RelativeSize`, `OverflowPenalty`는 파일만 남아 있고 `createDefaultEngine`에 등록 안 됨. 이들의 삭제는 별도 판단 → 본 spec에서 건드리지 않음
- **`utils/` 이동** — `utils/`는 `slot`, `override`, `propPatterns` 등 엔진 무관 유틸. `variant-merger/`로 이동하지 않고 `processors/` 루트에 유지

---

## 3. 목표 구조

```
processors/
├── variant-merger/                ← 신규 디렉토리
│   ├── VariantMerger.ts
│   ├── VariantGraphBuilder.ts
│   ├── VariantSquasher.ts         ← renamed from UpdateSquashByIou.ts
│   ├── NodeMatcher.ts
│   ├── LayoutNormalizer.ts
│   ├── match-engine/              ← 그대로 이동 (이름 유지)
│   │   ├── MatchDecisionEngine.ts
│   │   ├── MatchingPolicy.ts
│   │   ├── MatchSignal.ts
│   │   ├── index.ts
│   │   └── signals/
│   │       ├── IdMatch.ts
│   │       ├── InstanceSpecialMatch.ts
│   │       ├── NormalizedPosition.ts
│   │       ├── OverflowPenalty.ts
│   │       ├── ParentShapeIdentity.ts
│   │       ├── RelativeSize.ts
│   │       ├── TextSpecialMatch.ts
│   │       ├── TypeCompatibility.ts
│   │       ├── VariantPropPosition.ts
│   │       └── WrapperRoleDistinction.ts
│   └── index.ts                   ← 공개 API barrel (신규)
├── ExternalRefsProcessor.ts       ← 그대로
├── InstanceSlotProcessor.ts       ← 그대로
├── InteractionLayerStripper.ts    ← 그대로
├── PropsExtractor.ts              ← 그대로
├── SlotProcessor.ts               ← 그대로
├── StyleProcessor.ts              ← 그대로
├── TextProcessor.ts               ← 그대로
├── VisibilityProcessor.ts         ← 그대로
└── utils/                         ← 그대로
```

---

## 4. 파일 매핑 (old → new)

### 4.1 이동 (순수 relocation, 내용 변경 없음)

| 기존 경로 | 새 경로 |
|---|---|
| `processors/VariantMerger.ts` | `processors/variant-merger/VariantMerger.ts` |
| `processors/VariantGraphBuilder.ts` | `processors/variant-merger/VariantGraphBuilder.ts` |
| `processors/NodeMatcher.ts` | `processors/variant-merger/NodeMatcher.ts` |
| `processors/LayoutNormalizer.ts` | `processors/variant-merger/LayoutNormalizer.ts` |
| `processors/match-engine/` (전체) | `processors/variant-merger/match-engine/` (전체) |

### 4.2 이동 + 리네임

| 기존 경로 | 새 경로 |
|---|---|
| `processors/UpdateSquashByIou.ts` | `processors/variant-merger/VariantSquasher.ts` |

**파일 내용 변경**:
- `export class UpdateSquashByIou` → `export class VariantSquasher`
- 클래스 body는 그대로 (메서드명 `isSimilarSizeForSquash`, `updateSquashByIou` 같은 내부 메서드명은 유지 — 메서드 리네임은 범위 밖)
- 파일 상단 주석에 "renamed from UpdateSquashByIou, see spec 2026-04-10-variant-merger-engine-consolidation" 한 줄 추가

### 4.3 신규

| 경로 | 내용 |
|---|---|
| `processors/variant-merger/index.ts` | 공개 API barrel. `export { VariantMerger } from "./VariantMerger";` 만 export |

---

## 5. 공개 API 정의

### 5.1 `variant-merger/index.ts` 내용

```ts
/**
 * Variant Merger Engine — 공개 API barrel.
 *
 * 이 모듈의 외부 소비자(TreeBuilder 등)는 반드시 이 파일에서 import한다.
 * 내부 파일(NodeMatcher, LayoutNormalizer, match-engine/* 등)은
 * 모듈 내부 구현으로 간주되며, 외부 production 코드에서 deep import하지 않는다.
 *
 * 테스트 파일은 unit test 목적으로 deep import를 허용한다 (아래 § 5.2 참조).
 */

export { VariantMerger } from "./VariantMerger";
```

**그 외 심볼은 export하지 않는다**. 이유: TreeBuilder가 현재 import하는 것이 `VariantMerger` 단 하나이기 때문. 다른 심볼(`NodeMatcher`, `LayoutNormalizer`, `VariantSquasher`, `VariantGraphBuilder`)은 엔진 내부에서만 사용됨.

### 5.2 Test 파일의 deep import 정책

테스트 파일은 engine internals를 직접 테스트해야 하므로 deep import 허용:

- `test/tree-builder/nodeMatcher.test.ts` → `@frontend/.../variant-merger/NodeMatcher`
- `test/tree-builder/layoutNormalizer.test.ts` → `@frontend/.../variant-merger/LayoutNormalizer`
- `test/tree-builder/match-engine/*` → `@code-generator2/.../variant-merger/match-engine/*`
- `test/audits/matchTrace.test.ts` → `@code-generator2/.../variant-merger/VariantMerger`, `LayoutNormalizer`, `NodeMatcher`

production `src/` 코드에서 deep import가 나타나면 향후 lint rule 추가 검토 (본 spec 범위 밖).

### 5.3 `match-engine/index.ts`는 그대로

`match-engine/`이 이미 자체 `index.ts`를 보유 (`createDefaultEngine`, `MatchDecisionEngine`, `defaultMatchingPolicy`, 타입 export). 본 spec은 이를 변경하지 않는다. `match-engine/`은 엔진의 **내부 서브모듈**로 유지된다.

---

## 6. Import 경로 업데이트 대상

### 6.1 내부 파일 (engine 내부 상호 참조)

이동되는 파일 자체의 내부 import (상대 경로)는 재배치 후 대부분 그대로 작동한다. 단 두 경우 확인 필요:

- **`match-engine/MatchSignal.ts`** — 현재 `import type { LayoutNormalizer } from "../LayoutNormalizer"` 상대 경로. `variant-merger/`로 같이 이동하므로 상대 경로 그대로 유효.
- **`NodeMatcher.ts`** — `import ... from "./match-engine"` 상대 경로. 이동 후 `variant-merger/match-engine/`와 상대 위치 동일하므로 그대로 유효.
- **`VariantMerger.ts`** — `./NodeMatcher`, `./LayoutNormalizer`, `./VariantGraphBuilder`, `./UpdateSquashByIou` 상대 경로. 이동 후 `UpdateSquashByIou` → `VariantSquasher`로 리네임 반영 필요. 나머지는 그대로 유효.
- **`VariantSquasher.ts`** (이동+리네임) — `./LayoutNormalizer` 상대 경로 그대로 유효.

**요약**: 엔진 내부 상대 경로는 리네임 1건(`UpdateSquashByIou` → `VariantSquasher`)만 반영하면 됨.

### 6.2 외부 production 파일

| 파일 | 현재 import | 새 import |
|---|---|---|
| `tree-builder/TreeBuilder.ts` | `import { VariantMerger } from "./processors/VariantMerger";` | `import { VariantMerger } from "./processors/variant-merger";` |

**단 1개 파일**. 이게 production 경로에서 엔진에 의존하는 유일한 진입점이다.

### 6.3 Test 파일 (16개, 확정)

모든 테스트는 `@code-generator2/...` 또는 `@frontend/...` 절대 경로를 사용. 경로에서 `processors/` 뒤에 `variant-merger/`를 삽입.

**Engine root 파일 import (3개 테스트)**:

| 파일 | 변경 |
|---|---|
| `test/tree-builder/nodeMatcher.test.ts` | `processors/NodeMatcher` → `processors/variant-merger/NodeMatcher` |
| `test/tree-builder/layoutNormalizer.test.ts` | `processors/LayoutNormalizer` → `processors/variant-merger/LayoutNormalizer` |
| `test/audits/matchTrace.test.ts` | `VariantMerger`, `LayoutNormalizer`, `NodeMatcher` 3건 모두 `variant-merger/` prefix 추가 |

**match-engine 하위 테스트 (13개)**:

| 파일 | 변경 |
|---|---|
| `test/tree-builder/match-engine/MatchDecisionEngine.test.ts` | `processors/match-engine/...` → `processors/variant-merger/match-engine/...` |
| `test/tree-builder/match-engine/MatchSignal.test.ts` | 동일 |
| `test/tree-builder/match-engine/MatchingPolicy.test.ts` | 동일 |
| `test/tree-builder/match-engine/signals/IdMatch.test.ts` | 동일 |
| `test/tree-builder/match-engine/signals/InstanceSpecialMatch.test.ts` | 동일 |
| `test/tree-builder/match-engine/signals/NormalizedPosition.test.ts` | 동일 |
| `test/tree-builder/match-engine/signals/OverflowPenalty.test.ts` | 동일 |
| `test/tree-builder/match-engine/signals/ParentShapeIdentity.test.ts` | 동일 |
| `test/tree-builder/match-engine/signals/RelativeSize.test.ts` | 동일 |
| `test/tree-builder/match-engine/signals/TextSpecialMatch.test.ts` | 동일 |
| `test/tree-builder/match-engine/signals/TypeCompatibility.test.ts` | 동일 |
| `test/tree-builder/match-engine/signals/VariantPropPosition.test.ts` | 동일 |
| `test/tree-builder/match-engine/signals/WrapperRoleDistinction.test.ts` | 동일 |

**기계적 변경**: 전체 test 파일에서 `processors/match-engine` → `processors/variant-merger/match-engine`, `processors/NodeMatcher` → `processors/variant-merger/NodeMatcher` 등. sed-level 치환.

### 6.4 Audit/anomaly test (확인 완료)

`test/audits/` 하위에서 엔진 파일을 직접 import하는 것은 **`matchTrace.test.ts` 단 1개**뿐 (§6.3에서 이미 처리). 다른 audit 테스트(`anomalyScan.ts`, `variantMatchingAudit.test.ts`, `runAudit.ts`, `auditDiff.ts` 등)는 엔진 파일을 직접 참조하지 않고 상위 진입점(`FigmaCodeGenerator`/`TreeBuilder`)을 사용하므로 경로 변경 영향 없음.

### 6.5 문서 (docs/)

`docs/superpowers/plans/*.md` 파일들이 이전 작업 기록으로 engine 파일 경로를 여러 곳에서 언급함. **이들은 historical record이므로 업데이트하지 않는다**. (업데이트 시작하면 영원히 유지보수 필요 → 역사 기록은 당시 경로 그대로 두는 게 원칙).

단 본 spec의 선행/후속 문서 2개(`2026-04-08-variant-merger-engine-design.md`, `2026-04-10-hungarian-observation-tool-design.md`)는 파일 경로 언급 부분을 새 경로로 업데이트한다.

---

## 7. 검증

### 7.1 자동 검증

1. **TypeScript 컴파일**: `npx tsc --noEmit` 통과 (`tsc` 에러 0)
2. **단위 테스트**: `npm run test` 전원 통과 (현재 1000+ 테스트)
3. **브라우저 테스트**: `npm run test:browser` 전원 통과
4. **Audit 회귀**: `npm run audit` 통과 — baseline 값이 본 spec 전후로 동일 (1856 유지)
5. **Anomaly baseline**: `npm run audit:anomaly` 통과 — 119 유지
6. **Lint**: `npm run lint` 통과

### 7.2 수동 검증

1. **경로 잔존 확인**: `git grep "processors/NodeMatcher" | grep -v docs/superpowers/plans/` 결과 0건 (docs/plans는 historical이므로 제외)
2. **파일 위치 확인**: `ls processors/variant-merger/` 6개 파일 + match-engine/ + index.ts 확인
3. **Barrel export 검증**: TreeBuilder의 import가 `./processors/variant-merger`만 쓰는지 확인

### 7.3 Rollback 기준

이 spec은 **behavior 변화가 0**이어야 하므로, 검증 결과 중 어느 하나라도 다음과 다르면 rollback:

- 단위/브라우저 테스트 failure 증가
- Audit baseline 숫자 변화 (1856 / 119 이탈)
- 컴파일 에러

Rollback = `git revert` 단일 commit (본 spec은 단일 commit으로 수행한다. 여러 commit으로 쪼개지 않음 — 중간 상태가 깨지면 복원 어려움).

---

## 8. 리스크와 완화

### 8.1 리스크

1. **경로 치환 누락**: 어느 파일의 import 한 줄을 놓쳐서 컴파일 에러. → 완화: TypeScript 컴파일이 즉시 잡음.
2. **글로벌 전역 참조**: `matchTrace` 같은 도구가 `globalThis.__MATCH_REASON_LOG__` 같은 전역에 의존. 파일 이동 자체는 영향 없으나 테스트 실행 시 우연히 끊길 가능성. → 완화: 검증 §7.1의 matchTrace.test.ts 실행으로 확인.
3. **Vite/Vitest 경로 alias**: `@code-generator2`, `@frontend` alias가 `tsconfig.json` / `vite.config.ts`에 설정돼 있는지 확인 필요. 이 alias는 디렉토리 이동에 영향 받지 않아야 함 (alias는 `src/` 루트 기준).
4. **IDE 자동 import cache**: 이동 후 IDE가 옛 경로를 자동 suggest할 수 있음. → 완화: 사용자가 해결할 일, spec 범위 밖.
5. **Git history 가독성**: 파일 이동은 `git log --follow`가 필요해짐. → 완화: 단일 commit으로 수행하면 `git blame -C` 옵션으로 추적 가능.

### 8.2 완화 전략

- **단일 commit 수행**: 부분 이동 → 테스트 → 나머지 이동 패턴 **금지**. 중간 상태에서 깨지면 rollback 대상이 애매해짐. 한 번에 전부 이동 → 테스트 → 통과 확인 → commit.
- **Dry run**: commit 전 `git status`로 이동/수정 파일 목록을 사용자와 함께 검토.

---

## 9. 작업 순서 (구현 계획 작성 시 참고)

이 섹션은 Spec A 본 문서가 아닌 **implementation plan**에서 구체화될 내용의 개요이다.

1. `variant-merger/` 디렉토리 생성
2. 6개 파일 이동 (`git mv` 사용 — history 보존)
3. `UpdateSquashByIou.ts` → `VariantSquasher.ts` 파일명 변경 + 내부 클래스명 변경
4. `variant-merger/index.ts` 생성 (VariantMerger 단일 export)
5. `VariantMerger.ts`의 내부 import에서 `UpdateSquashByIou` → `VariantSquasher` 업데이트
6. `TreeBuilder.ts`의 import 업데이트 (1건)
7. 17개 test 파일의 import 일괄 업데이트
8. `tsc --noEmit` 확인
9. `npm run test` 확인
10. `npm run test:browser` 확인
11. `npm run audit` + `npm run audit:anomaly` 확인
12. 선행/후속 spec 문서의 경로 언급 업데이트
13. 단일 commit 생성

---

## 10. 알려진 한계

1. **Deep import 관용 관행**: 본 spec은 production 코드에서만 `variant-merger/index.ts` 사용을 권장하지만 **강제하지 않는다**. ESLint rule이나 TypeScript module boundaries 기능으로 강제하려면 별도 spec 필요.
2. **`NodeMatcher` 리팩토링 미룸**: Spec C에서 제거 예정인 `NodeMatcher`가 여전히 engine root에 남음. 일시적으로 "이동은 했지만 곧 제거될 파일"이 존재. Spec C에서 제거 시 경로 alias는 그 때 정리.
3. **죽은 signal 파일 보존**: `WrapperRoleDistinction`, `ParentShapeIdentity`, `RelativeSize`, `OverflowPenalty`는 `createDefaultEngine`에 등록 안 된 상태로 파일만 남음. 이들의 삭제/보존 결정은 Spec C 또는 별도 작업에서.
4. **`utils/` 분리 모호**: `processors/utils/`에 있는 `overrideUtils`, `rewritePropConditions` 등이 특정 processor 전용인지, 전역 유틸인지 불분명. 본 spec은 `utils/`를 건드리지 않는다 — 필요 시 별도 분류 작업.

---

## 11. 영향 받는 파일 요약

**이동**:
- 6개 engine 파일 (`processors/` → `processors/variant-merger/`)
- `match-engine/` 디렉토리 1개 (내부 10+ 파일 포함)

**리네임**:
- `UpdateSquashByIou.ts` → `VariantSquasher.ts` (클래스명 포함)

**신규**:
- `processors/variant-merger/index.ts`

**Import 업데이트**:
- production: 2개 파일 (`TreeBuilder.ts`, `VariantMerger.ts`)
- test: 16개 파일 (`test/tree-builder/nodeMatcher.test.ts`, `layoutNormalizer.test.ts`, `test/tree-builder/match-engine/*` 13개, `test/audits/matchTrace.test.ts`)
- spec docs: 2개 파일 (Spec 원본 + Spec B)

**Behavior 변화**: **0**. 모든 테스트 전원 통과, audit/anomaly baseline 불변.

---

## 12. 후속 작업

이 spec이 완료되면 즉시 다음 spec으로 진행:

- **Spec B** — Hungarian Matrix Observer 구현 (경로는 본 spec 완료 후 `variant-merger/` 기준)
- **Spec C** — 신호 독립성 복원 (NP 단락 제거, NodeMatcher 통합, Squash 엔진 통합)
- **Spec D** — 페어 단언 인프라
- **Spec E** — 범용성 원칙 문서
