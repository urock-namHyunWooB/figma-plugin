# Variant Style Feedback Engine 디자인

**작성일**: 2026-04-09
**대상**:
- `src/frontend/ui/domain/code-generator2/layers/tree-manager/post-processors/DynamicStyleDecomposer.ts` (업그레이드)
- `src/frontend/ui/components/PropsMatrix.tsx` (셀 툴팁 제거)
- 신규: `FeedbackBuilder`, `FeedbackPanel`, feedback fix 메시지 핸들러
**상태**: Draft (사용자 검토 대기)

---

## 1. 문제 정의

### 1.1 디자이너 관점의 문제

Figma variant 컴포넌트에서 `Type=Primary`, `State=Hover` 같은 prop이 **특정 스타일 속성을 일관되게 제어해야** 한다. 예를 들어 `Type=Primary`는 모든 State/Size 조합에서 같은 primary 색 계열을 써야 한다. 디자이너가 실수로 `Primary+Hover`에서 다른 계열 색을 쓰면 → variant 구조가 깨지고, 생성된 React 코드도 prop ownership이 꼬인다.

현재 디자이너는 이 실수를 **사전에 인지할 방법이 없다**. 코드를 뽑아본 뒤 어색함을 느껴야만 알아채며, 그나마도 "어느 variant가 문제였는지" 역추적하기 어렵다.

### 1.2 엔진 관점의 문제

이미 `DynamicStyleDecomposer`가 **FD(Functional Dependency) 일관성 검사**를 수행한다:

> prop P가 CSS 속성 C를 제어한다 = P의 같은 값 그룹 내에서 C의 값이 항상 동일하다.

검사 결과에 따라 1차(single prop FD) → 2차(compound FD) → 3차(best-fit 강제 할당) 순으로 소유권을 결정한다. 하지만 현재 진단 수집에는 여러 한계가 있다:

| 한계 | 결과 |
|------|------|
| 3차 best-fit 폴백 경로에서만 `collectDiagnostics` 실행 | 1차/2차가 성공해도 남아 있는 잠재 불일치를 놓침 |
| `JsxGenerator.collectedDiagnostics`가 **static 필드**로 부산물 수집 | 재진입 불가, side effect, "피드백만 돌리기" 불가능 |
| `VariantInconsistency` 타입에 `nodeName?: string`만 있고 **nodeId 없음** | jump-to-node 자체 불가 |
| `FigmaCodeGenerator.bindingFeedbackToDiagnostics`가 전혀 다른 도메인(바인딩 누락)을 `VariantInconsistency`로 우겨넣음 | 피드백 전용 채널이 없어서 타입 남용 |
| 진단이 `PropsMatrix`의 셀 위 ⚠️ 툴팁으로만 노출 | 호버하며 찾아야 함 → a(볼륨), b(네비게이션), e(공간) 모두 실패 |

즉 **분해기는 분해에 필요한 만큼만 검사하고 부산물로 진단을 흘린다**. 피드백 엔진으로 쓰기엔 감지 범위도 좁고 출력도 지저분하다.

---

## 2. Goal

1. **분해기를 엔진 수준으로 승격** — 전수 검사 + 깨끗한 반환값 + Figma nodeId 포함
2. **디자이너에게 보여줄 피드백 UI를 새로 설계** — 기존 셀 툴팁의 UX 실패 원인 제거
3. **fix-assist 제공** — 기대값이 계산되는 경우 원클릭으로 Figma에 써주기
4. **기존 분해/코드 생성 결과 불변** — 분해기 업그레이드 후에도 기존 스냅샷 테스트 모두 통과

---

## 3. Non-Goals (MVP 제외)

- **Cross-component 일관성** — Button의 Primary와 Badge의 Primary가 같은 토큰을 쓰는지 검사. 디자인 시스템 토큰 연동 필요, 별도 작업.
- **Semantic 역할 위반 감지** — "Size prop은 spacing만, Type prop은 color만" 같은 의미 규칙. prop별 기대 도메인 정의 필요, 별도 작업.
- **디자인 토큰 준수 감사** — raw hex vs 토큰 변수 사용 여부. 토큰 시스템 연동 필요.
- **피드백 dismiss/resolve persist** — 세션 간 기억. MVP에서는 세션 내 숨김만.
- **여러 컴포넌트 동시 피드백** — MVP는 현재 선택된 컴포넌트 하나.
- **바인딩 누락 피드백(PropertyBindingFeedback) 통합** — 별도 채널이 적절함. 이번 작업에서는 `VariantInconsistency` 남용만 끊고 기존 동작 유지.

---

## 4. Architecture

```
[기존 파이프라인 — 거의 변화 없음]
FigmaData → DataManager → TreeManager → DynamicStyleDecomposer
                                              ↓
                           { decomposition, diagnostics: VariantInconsistency[] }
                                              ↓
                          ┌───────────────────┴───────────────────┐
                          ↓                                       ↓
                    [기존 경로]                            [새 경로]
                    CodeEmitter                          FeedbackBuilder
                    (decomposition만 소비)                (diagnostics만 소비)
                                                              ↓
                                                      FeedbackGroup[]
                                                              ↓
                                                      [frontend UI]
                                                      FeedbackPanel
                                                              ↓
                                                      [→ Figma] / [Fix]
                                                              ↓
                                                      feedbackFixHandler (backend)
                                                              ↓
                                                      figma.node.setProperty(...)
```

**핵심**: 분해기는 자기 자리에 그대로 있고, 출력을 깨끗하게 다듬는다. 코드 에미터는 `decomposition`만 쓴다 (현재와 동일). `FeedbackBuilder`는 같은 실행에서 나온 `diagnostics`만 쓴다 (새 경로). 둘 다 같은 분해기의 한 번 실행 결과를 재료로 한다.

---

## 5. 분해기 엔진 승격

**파일**: `DynamicStyleDecomposer.ts` (업그레이드)

### 5.1 전수 검사

현재 `collectDiagnostics`는 `findControllingPropBestFit` 안에서만 호출된다. 이걸 확장해서 **모든 CSS 속성에 대해 독립적으로 일관성 감사를 수행**하는 별도 경로를 추가한다.

```
auditAllCssKeys(matrix, allProps):
  for cssKey in allCssKeys(matrix):
    for prop in allProps:
      groups = buildPropGroups(prop, cssKey, matrix)
      for (propValue, group) in groups:
        if not isGroupConsistent(group):
          → diagnostics.push(...)
    // compound도 동일하게 audit
```

이 감사는 **분해 결과와 별개로** 수행된다. 분해가 1차 single-prop FD로 성공해도, 해당 prop의 다른 값 그룹에 숨어 있는 소규모 불일치는 여전히 감지된다.

> 주의: 분해 알고리즘이 "소유자"로 선정한 prop만 대상으로 할지, 모든 prop을 대상으로 할지 결정이 필요하다. 후자는 false positive 가능성이 있다 (예: Size prop이 color를 우연히 부분적으로 일관되게 다르게 쓸 때). MVP는 **분해기가 소유자로 선정한 prop 범위 안에서만** 전수 검사 — 즉 "이 prop이 이 CSS를 소유한다"고 판정된 관계에서 실제로 완벽하게 일관되는지 확인. 이렇게 하면 false positive가 거의 없고, 사용자의 "FD 분해 실패만 잡아" 라는 요구에도 부합한다.

### 5.2 깨끗한 반환값

현재:
```typescript
// JsxGenerator.ts — 부산물 수집 (static singleton)
private static collectedDiagnostics: VariantInconsistency[] = [];

// DynamicStyleDecomposer.ts — side effect 주입
static decompose(...): { result; diagnostics }  // 이미 존재
```

변경:
- `JsxGenerator.collectedDiagnostics` **삭제**
- `DynamicStyleDecomposer.decompose`의 `{ result, diagnostics }` 반환을 상위로 명시적으로 전달
- `TreeManager.build` 시그니처에서 `diagnostics?: VariantInconsistency[]` **out parameter** 패턴을 `Promise<{ tree, diagnostics }>` 같은 **return value**로 변경
- `FigmaCodeGenerator.compileWithDiagnostics`는 이미 `CompileResult`에 `diagnostics` 필드를 넘기므로 그 자리에 새 엔진의 출력이 그대로 들어감

### 5.3 Figma nodeId 포함

`VariantInconsistency.variants[*]`에 `figmaNodeId: string` 추가:

```typescript
interface VariantInconsistency {
  cssProperty: string;
  propName: string;
  propValue: string;
  nodeName?: string;
  nodeId: string;                    // NEW — 트리 내 UINode id
  figmaNodeId: string;               // NEW — Figma 원본 노드 id (머지된 다수 중 대표 1개)
  variants: Array<{
    props: Record<string, string>;
    value: string;
    figmaNodeId: string;             // NEW — 이 variant가 나온 Figma 원본 노드 id
  }>;
  expectedValue: string | null;
}
```

**Threading**: `VariantMerger`는 각 InternalNode에 origin `mergedNodes` (Figma 원본 nodeId 목록)을 이미 보존한다. `StyleProcessor`가 variant별 스타일을 만들 때 origin nodeId를 같이 저장하고, `DynamicStyleDecomposer`가 matrix entry에 propagate.

> 구현 전 확인 필요: `MatrixEntry`에 이미 origin 정보가 붙는지, 아니면 처음부터 threading이 필요한지. Plan 단계에서 확인.

### 5.4 순수 함수화

`collectDiagnostics`가 mutable array를 인자로 받는 패턴(`diagnostics: VariantInconsistency[]`)을 `VariantInconsistency[]` 반환으로 바꿈. `JsxGenerator` 쪽 side effect 주입도 제거.

---

## 6. FeedbackBuilder

**파일**: `src/frontend/ui/domain/code-generator2/feedback/FeedbackBuilder.ts` (신규)

### 6.1 책임

- 입력: `VariantInconsistency[]` (분해기 출력)
- 출력: `FeedbackGroup[]`
- **계산 없음**. 그룹핑 + 사람 읽을 요약 + fix 가능 여부 마킹만.

### 6.2 데이터 모델

```typescript
interface FeedbackGroup {
  id: string;                            // stable id
  componentSetName: string;              // "Button"
  rootCauseHint: string;                 // "Primary+Hover에서 색 3속성 일관성 깨짐"
  sharedContext: {
    figmaNodeId: string;                 // 묶음 기준 노드
    variantCoordinate: Record<string, string>;  // { type: "primary", state: "hover" }
  };
  items: FeedbackItem[];
  canAutoFixGroup: boolean;              // items 중 fixable이 1개라도 있으면 true
}

interface FeedbackItem {
  id: string;
  cssProperty: string;
  actualValue: string;
  expectedValue: string | null;          // null = 2:2 동점 등 기대값 계산 불가
  figmaNodeId: string;
  variantCoordinate: Record<string, string>;
  canAutoFix: boolean;                   // expectedValue != null
  reason: string;                        // "Primary+Hover만 #10B981, 나머지 Primary는 #3B82F6"
}
```

### 6.3 그룹핑 규칙

**`(figmaNodeId, variantCoordinate)` 튜플이 같은 item들은 한 그룹으로 묶는다.**

근거: 한 Figma 노드의 같은 variant 좌표에서 여러 CSS 속성이 동시에 깨졌다면, 디자이너가 그 variant 하나를 잘못 만졌을 가능성이 높다. 한 곳 고치면 여러 개 해결될 가능성이 큼 → 묶어서 보여주면 "어디부터 볼지" 힌트가 된다.

그룹이 틀릴 위험을 줄이려고 **규칙 기반**으로만 묶는다 (예: 휴리스틱·의미적 추론 없음). 디자이너가 "왜 묶였는지" 이해 가능해야 함.

### 6.4 정보 손실 없음

그룹핑은 **표시 계층**이다. 각 `FeedbackItem`은 여전히 원자 단위 정보를 모두 갖는다. UI에서 펼치면 개별 항목 단위로 `[→ Figma]`, `[Fix]`가 제공된다.

---

## 7. FeedbackPanel (UI)

**파일**: `src/frontend/ui/components/FeedbackPanel.tsx` (신규)

### 7.1 레이아웃

좁은 플러그인 패널 전제. 기본 접힌 카드 리스트:

```
┌─ Feedback (3) ────────────────┐
│                                │
│ ⚠ Primary+Hover               │
│   색 3속성 일관성 깨짐          │
│                       [Fix 3] │  ← per-group
│ ▸ (클릭하면 펼침)              │
│                                │
│ ⚠ Size=Large                  │
│   padding 불일치              │
│                       [Fix]   │
│ ▸                              │
│                                │
└────────────────────────────────┘
```

펼친 상태:

```
┌─ Feedback (3) ────────────────┐
│                                │
│ ⚠ Primary+Hover               │
│   색 3속성 일관성 깨짐          │
│                       [Fix 3] │
│ ▾                              │
│   background                   │
│     실제:  #10B981             │
│     기대:  #3B82F6             │
│     [→ Figma] [Fix]            │
│   ─                            │
│   border-color                 │
│     실제:  #059669             │
│     기대:  #2563EB             │
│     [→ Figma] [Fix]            │
│   ─                            │
│   ...                          │
│                                │
└────────────────────────────────┘
```

### 7.2 동작

- **[→ Figma]** 클릭: `postMessage({ type: "focus-node", figmaNodeId })` → backend가 `figma.currentPage.selection = [node]; figma.viewport.scrollAndZoomIntoView([node])`
- **[Fix]** (per-item): `postMessage({ type: "apply-fix-item", itemId })` → backend가 해당 노드의 해당 CSS 속성을 `expectedValue`로 변경
- **[Fix N]** (per-group): `postMessage({ type: "apply-fix-group", groupId })` → backend가 그룹 내 `canAutoFix: true`인 모든 item을 한 번에 변경 (undo 한 번으로 전부 되돌림)
- **canAutoFix: false**: Fix 버튼 비활성 + 툴팁 "동점으로 기대값 계산 불가"
- **세션 내 dismiss**: 카드 우상단 `✕` → 현재 세션에서만 숨김 (persist 안 함)

### 7.3 기존 UI 정리

- `PropsMatrix.tsx`의 `WarningOverlay` 컴포넌트 **삭제**
- `findCellWarnings` **삭제**
- `PropsMatrix` props에서 `warnings?: VariantInconsistency[]` **삭제**
- `App.tsx`의 `variantWarnings` state는 새 `FeedbackPanel`로 연결

---

## 8. feedbackFixHandler (backend 메시지 핸들러)

**파일**: `src/backend/handlers/feedbackFixHandler.ts` (신규, 경로는 실제 backend 구조에 맞춤)

### 8.1 책임

UI에서 온 fix 메시지를 받아 Figma API로 해당 노드의 속성을 기대값으로 변경.

### 8.2 CSS 속성 → Figma API 매핑

MVP 대상 속성 (기존 `VariantInconsistency`가 주로 커버하는 범위):
- `background`, `background-color` → `node.fills`
- `color` → TextNode의 `fills`
- `border-color` → `node.strokes`
- `border-radius`, `border-*-radius` → `node.cornerRadius` / per-corner
- `padding-*` → `node.paddingTop/Right/Bottom/Left`
- `gap` → `node.itemSpacing`
- `opacity` → `node.opacity`

지원 안 되는 속성은 `canAutoFix: false`로 내려보내서 UI에서 비활성화.

### 8.3 Undo 처리

Figma 플러그인 API는 한 번의 메시지 핸들러 실행 내 변경을 **하나의 undo 스텝**으로 묶는다. Per-group fix도 같은 핸들러 안에서 루프로 처리하면 ⌘Z 한 번에 전부 되돌아감. 별도 커스텀 rollback 구현 불필요.

### 8.4 안전장치

- 기대값이 `null`인 item은 fix 요청 자체를 차단 (UI + backend 양쪽 방어)
- 노드가 이미 삭제/변경됐으면 noop + 에러 메시지
- 미리보기는 MVP에 없음 — Figma 자체 변화가 곧 미리보기, 마음에 안 들면 ⌘Z

---

## 9. 삭제되는 것

| 항목 | 위치 | 이유 |
|------|------|------|
| `JsxGenerator.collectedDiagnostics` static 필드 | `generators/JsxGenerator.ts` | side effect 수집 제거 |
| `WarningOverlay` 컴포넌트 | `components/PropsMatrix.tsx` | 셀 툴팁 UX 실패 |
| `findCellWarnings` 함수 | `components/PropsMatrix.tsx` | 셀 툴팁 지원 함수 |
| `PropsMatrix.warnings` prop | `components/PropsMatrix.tsx` | 더 이상 소비 안 함 |
| `FigmaCodeGenerator.bindingFeedbackToDiagnostics` | `FigmaCodeGenerator.ts` | 타입 남용 제거. 바인딩 피드백은 별도 채널로 이동하거나 MVP 외 |

---

## 10. 테스트

### 10.1 분해기 승격 테스트 (회귀 방지)

- 기존 스냅샷 테스트 전수 통과 (`npm run test`)
- 기존 `test/code-emitter/DynamicStyleDecomposer.test.ts` 전수 통과
- 전수 검사 추가 후에도 `decomposition` 출력이 완전 동일함을 확인

### 10.2 엔진 전수 검사 신규 테스트

- 1차 single-prop FD로 분해 성공한 케이스에서도 숨어 있는 불일치 감지
- 2차 compound FD 성공 케이스
- 3차 best-fit 폴백 케이스 (기존 동작 유지)
- Figma nodeId가 모든 `VariantInconsistency.variants[*]`에 채워지는지 검증

### 10.3 FeedbackBuilder 유닛 테스트

- 입력 `VariantInconsistency[]` → 기대 `FeedbackGroup[]` 스냅샷
- 그룹핑 규칙: 같은 `(figmaNodeId, variantCoordinate)` 묶이는지
- `canAutoFix`: `expectedValue == null` → false
- 요약 텍스트 생성 규칙

### 10.4 feedbackFixHandler 유닛 테스트

- Figma API mock으로 fill/stroke/cornerRadius 등 각 속성 매핑 검증
- 기대값 null 차단 검증
- 삭제된 노드 핸들링

### 10.5 통합 테스트 (선택)

- 실제 fixture (e.g., `failing/Buttonsolid`) → compile → `FeedbackGroup[]` 생성 → 기대 건수/구조 검증

---

## 11. 위험 요소

| 위험 | 완화 |
|------|------|
| 분해기 리팩토링이 기존 스냅샷을 깨뜨림 | 리팩토링은 pure 구조 변경 (로직 동일) + 스냅샷 전수 검증 게이트 |
| Figma nodeId threading이 기존 코드에서 깔끔히 안 될 수 있음 | plan 단계에서 `MatrixEntry`/`StyleProcessor`에 origin nodeId가 이미 있는지 먼저 확인. 없으면 threading이 큰 작업이 될 수 있으므로 별도 태스크로 분리 |
| 전수 검사가 예상치 못한 false positive를 만듦 | MVP는 **분해기가 이미 소유자로 선정한 prop 범위** 안에서만 검사 (5.1 주의 참조). 넓히는 건 나중에 |
| per-group fix가 Figma undo에서 분리될 수 있음 | 단일 메시지 핸들러 내 처리 + 초기 스모크 테스트로 확인. 만약 분리되면 `figma.commitUndo()` 명시 호출로 컨트롤 |
| CSS → Figma API 매핑이 누락된 속성을 fixable로 잘못 내려보냄 | UI/backend 양쪽에서 매핑 whitelist 강제. 누락 속성은 `canAutoFix: false` |

---

## 12. 단계 분할 제안 (plan 단계용 힌트)

1. **Phase A — 분해기 엔진 승격 (회귀 0건)**
   - `JsxGenerator.collectedDiagnostics` 제거 + return value threading
   - `VariantInconsistency`에 nodeId 필드 추가 + origin threading
   - 전수 검사 로직 추가 (소유자 prop 범위 한정)
   - 스냅샷/유닛 테스트 전수 통과

2. **Phase B — FeedbackBuilder**
   - `feedback/` 디렉토리 + 타입 정의
   - 그룹핑 + 요약 생성 로직
   - 유닛 테스트

3. **Phase C — UI 교체**
   - `FeedbackPanel` 신규
   - `PropsMatrix` 셀 툴팁 제거
   - `App.tsx` 연결

4. **Phase D — fix-assist**
   - backend 메시지 핸들러
   - CSS → Figma API 매핑 + 테스트
   - per-item + per-group 동작 확인
