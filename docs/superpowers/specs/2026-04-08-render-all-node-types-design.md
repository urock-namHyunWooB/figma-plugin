# 모든 노드 타입 렌더링 허용 — 설계

## 문제

현재 코드 생성기는 `COMPONENT_SET`만 입력으로 받는다. 사용자가 `COMPONENT`, `FRAME`, `INSTANCE`, `TEXT`, `RECTANGLE` 등 다른 타입의 노드를 선택하면 코드가 생성되지 않는다.

차단점은 두 곳이다.

1. **`src/frontend/ui/App.tsx:338`** — 코드 생성 useEffect가 `document.type !== "COMPONENT_SET"`이면 early return.
2. **`src/backend/FigmaPlugin.ts:28-34`** — 선택 핸들러가 INSTANCE 등을 자동으로 부모 `COMPONENT_SET`으로 점프시킴. 사용자가 그 아래 노드를 직접 다룰 수 없음.

파이프라인 내부(`DataManager`, `VariantMerger`)는 이미 비-COMPONENT_SET 분기를 부분적으로 갖추고 있다 (`DataManager.ts:233`, `VariantMerger.ts:52`).

## 목표

- 모든 `SceneNode` 타입을 코드 생성 입력으로 허용한다.
- 사용자가 선택한 노드를 그대로 렌더링한다 (자동 점프 제거).
- 비-`COMPONENT_SET` 노드에서는 Variants 탭을 숨긴다.
- 빈 선택은 안내 메시지, 멀티 선택은 첫 번째 노드만 사용한다.

## 비-목표

- 새로운 추상화 레이어(`EntryNormalizer`, 별도 `SingleNodePipeline`)를 도입하지 않는다.
- 비-`COMPONENT_SET` 노드에서 가짜 variant prop을 합성하지 않는다.
- 멀티 선택을 하나의 컴포넌트로 묶는 기능은 다루지 않는다.

## 변경 지점

### 1. `src/backend/FigmaPlugin.ts` — 선택 핸들링 정리

**`REQUEST_REFRESH` 핸들러 (현재 line 23-43):**
- 자동 점프 로직(line 28-34) 제거
- `selection.length === 0` → 빈 data 전송 + early return
- `selection.length >= 1` → `selection[0]`만 사용

**`selectionchange` 핸들러 (현재 line 45-51):**
- 빈/멀티 선택 처리를 동일하게 정리
- 항상 `selection[0]` (있으면) 또는 빈 data 전송

### 2. `src/frontend/ui/App.tsx` — 코드 생성 게이트 축소

**현재 (line 338):**
```ts
if (!selectionNodeData || selectionNodeData.info?.document?.type !== "COMPONENT_SET") {
  // early return
}
```

**변경 후:**
```ts
if (!selectionNodeData) {
  // early return — 빈 선택만 차단
}
```

### 3. `src/frontend/ui/App.tsx` — Variants 탭 숨김

**현재 (line 575~):** 탭은 항상 보이고, 비-`COMPONENT_SET`이면 콘텐츠에서만 안내 메시지.

**변경 후:**
- 탭 navigation에서 Variants 탭 자체를 조건부 렌더 (비-`COMPONENT_SET`이면 미표시)
- `activeTab === "variants"`인 상태에서 비-`COMPONENT_SET` 노드로 전환되면 자동으로 다른 탭(`preview`)으로 폴백

### 4. 테스트 픽스처 추가

- `test/tree-builder/full-build.test.ts` 또는 신규 테스트 파일에 다음 케이스 추가:
  - 단일 `COMPONENT` (variant 없음, componentPropertyDefinitions 있음)
  - 단일 `FRAME` (Auto Layout 포함)
  - 단일 `INSTANCE`
  - 단일 `TEXT`
  - 단일 `RECTANGLE`
- 각 케이스에 대해:
  - `FigmaCodeGenerator.compile()`이 throw 없이 완료
  - 결과 React 코드 문자열이 비어있지 않음
- 기존 `COMPONENT_SET` 회귀 테스트 전체 통과

## 데이터 흐름

```
선택 노드 (any type)
  → FigmaPlugin.getNodeData()  ─ 자동 점프 없음, selection[0] 그대로
  → App.tsx useEffect          ─ 타입 무관 FigmaCodeGenerator 실행
  → DataManager                 ─ 단일 노드면 totalVariantCount=1
  → VariantMerger               ─ 비-COMPONENT_SET이면 머지 스킵
  → TreeBuilder → CodeEmitter
  → React 코드
```

## 에러 처리

- **빈 선택**: 백엔드가 `ON_SELECTION_CHANGE` 메시지에 `data: null`을 전송 → UI는 기존 빈 상태 안내 재사용 (`selectionNodeData == null` 분기와 동일 경로)
- **멀티 선택**: `selection[0]`만 사용. UI상 별도 경고 없음 (사용자 결정)
- **파이프라인 내부 크래시**: 픽스처 검증 단계에서 발견되는 케이스에 한해 해당 지점에 핀포인트 가드 추가. 광범위 방어 코드는 도입하지 않음.

## 테스트 전략

- 신규 픽스처 5종(COMPONENT, FRAME, INSTANCE, TEXT, RECTANGLE)에 대해 컴파일 통과 + 비어있지 않은 출력 확인
- 기존 COMPONENT_SET 픽스처 전체 회귀 테스트
- 픽스처 검증 중 발견된 크래시는 그 지점만 가드 추가 후 회귀 픽스처화

## 위험과 완화

- **위험**: 파이프라인 깊은 곳(특정 Heuristic, StyleProcessor 등)에 비-COMPONENT_SET 가정이 숨어 있을 수 있음.
- **완화**: 다양한 타입의 픽스처로 검증 후 발견 즉시 핀포인트 수정. 사전 광범위 가드는 YAGNI 위반이므로 피한다.

## 영향 범위 (out of scope)

- 컴포넌트명 자동 생성 규칙 변경 (현재 로직 그대로 사용 — `node.name` 기반)
- Props 추출 로직 변경 (`COMPONENT`도 `componentPropertyDefinitions`를 가지므로 그대로 동작)
- 멀티 노드 합성 컴포넌트 생성
