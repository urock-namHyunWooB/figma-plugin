# ISSUE-001: 3차원 Variant 스타일 매핑 문제

## 상태
**OPEN** - 2026-02-02

## 문제 설명

3차원 variant 조합 (예: `size × type × states`)에서 각 prop별 스타일 Record를 생성할 때,
동일한 prop 값에 대해 여러 스타일이 존재하면 마지막 스타일이 이전 것을 덮어씁니다.

### 재현 케이스
- 테스트: `test/compiler/browser/browser-only.test.ts` - "urockButton"
- Fixture: `test/fixtures/button/urockButton.json`

### 예시
```
variant1: size=L, type=outlined_blue, states=default → { background: "#F7F9FE" }
variant2: size=S, type=outlined_blue, states=default → { background: "#E6E6E6" }
```

현재 로직:
```typescript
// groupDynamicStylesByProp에서
grouped.get("type")!.set("outlined_blue", style); // 마지막 스타일로 덮어씀
```

결과:
- `BtnCssTypeStyles.outlined_blue` = `{ background: "#E6E6E6" }` (잘못됨)
- 기대값: `{ background: "#F7F9FE" }`

## 원인 분석

`EmotionStyleStrategy.groupDynamicStylesByProp()`에서 복합 조건의 스타일을 각 prop에 단순히 할당합니다.
**어떤 CSS 속성이 어떤 prop에 의해 결정되는지** 분석하지 않습니다.

## 필요한 해결책

각 CSS 속성(예: `background`)이 어떤 prop에 의해 변화하는지 분석 필요:

1. `type`이 `filled` → `outlined_blue`로 변할 때 `background` 변화 여부 확인
2. `size`가 `L` → `S`로 변할 때 `background` 변화 여부 확인
3. 변화를 일으키는 prop의 Record에만 해당 CSS 속성 포함

### 알고리즘 제안
```
1. 모든 variant 조합 수집
2. 각 CSS 속성에 대해:
   a. 해당 속성이 변하는 경우를 찾음
   b. 변화가 어떤 prop 값 변화와 연관되는지 분석
   c. 해당 prop의 Record에 속성 할당
```

## 영향받는 파일

- `src/frontend/ui/domain/compiler/core/code-emitter/style-strategy/EmotionStyleStrategy.ts`
  - `groupDynamicStylesByProp()`
  - 또는 `StyleProcessor.classifyStyles()`에서 처리

## 관련 수정 (부분 해결)

이 이슈 조사 중 발견하여 수정한 문제들:

1. `collectDynamicProps`가 복합 조건에서 첫 번째 prop만 추출 → 모든 prop 추출하도록 수정
2. HTML 충돌 prop 이름 매칭 누락 (`type` → `customType`) → 매칭 로직 추가
3. CSS 함수에서 Record 참조 시 변수명 불일치 → 수정

위 수정으로 `urockChips` 테스트는 통과하지만, `urockButton` 테스트는 여전히 실패.

## 테스트 현황

```
✅ taptapButton - Text color 테스트 통과
✅ urockChips - color="cyan" 배경색 테스트 통과
❌ urockButton - customType="outlined_blue" 배경색 테스트 실패
```
