# conditionalGroup을 VisibilityProcessor로 이동 — 스타일 최적화

## 배경

현재 conditionalGroup 변환이 UITreeOptimizer(StyleProcessor 이후)에서 실행되어,
분기 안의 스타일 compound 키에 고정된 prop 차원(iconOnly)이 불필요하게 남는다.
VisibilityProcessor(StyleProcessor 이전)로 옮기면 StyleProcessor가 각 branch를
독립적으로 처리하여 자연스럽게 차원이 줄어든다.

## 변경 사항

### 1. InternalNode에 CONDITIONAL_GROUP 표현 추가

```typescript
// types.ts — InternalNode 인터페이스에 추가
interface InternalNode {
  // ... 기존 필드
  /** conditionalGroup 전용: 분기 기준 prop */
  branchProp?: string;
  /** conditionalGroup 전용: prop 값 → 해당 모드의 자식들 */
  branches?: Record<string, InternalNode[]>;
}
```

`type: "CONDITIONAL_GROUP"`은 Figma 타입이 아니므로 InternalNode.type에 새 값 추가.

### 2. VisibilityProcessor에서 conditionalGroup 생성

`applyVisibility()` 내에서 visibleCondition 설정 후, layoutModeSwitch annotation이 있는
컨테이너를 찾아 CONDITIONAL_GROUP 노드를 생성한다.

처리 순서:
1. 기존 visibleCondition 설정 (variant 출현/부재 기반)
2. layoutModeSwitch annotation 소비:
   - 분기 대상 자식을 children에서 제거
   - CONDITIONAL_GROUP 노드 생성 (prop, branches 설정)
   - 분기 자식과 하위 트리에서 분기 prop 관련 visibleCondition 재귀 제거
   - CONDITIONAL_GROUP을 컨테이너의 children에 삽입

### 3. StyleProcessor — branches 순회

StyleProcessor.applyStyles()에서 노드 순회 시 `node.branches`가 있으면
각 branch의 자식들도 순회하여 스타일을 처리한다.

각 branch는 독립적 컨텍스트이므로, 해당 branch에 없는 variant의 스타일은 자연스럽게
compound 키에서 제외된다.

### 4. UITreeOptimizer에서 transformLayoutModeSwitches 제거

더 이상 UINode 레벨에서 conditionalGroup 변환을 하지 않는다.
`optimizeMain()`과 `optimizeDependency()`에서 호출 제거.
`stripPropFromCondition`, `stripPropFromTree`, `transformLayoutModeSwitches` 메서드 삭제.

### 5. UINodeConverter — CONDITIONAL_GROUP 변환

InternalNode(`type: "CONDITIONAL_GROUP"`)를 UINode(`type: "conditionalGroup"`)로 변환.
`branchProp` → `prop`, `branches` → `branches` (자식도 재귀 변환).

### 6. 기존 코드 유지

- NodeRenderer의 conditionalGroup 렌더링 — 변경 없음
- SemanticIRBuilder의 branches 처리 — 변경 없음
- ConditionalGroupNode UINode 타입 — 변경 없음

## 기대 결과

Buttonsolid 생성 코드에서:
- Before: `${variant}+${size}+${iconOnly ? "true" : "false"}+${disable ? "true" : "false"}` (4차원)
- After: `${variant}+${size}+${disable ? "true" : "false"}` (3차원) — 분기 안에서 iconOnly 고정

## 테스트

- 기존 conditionalGroup 테스트 유지 (UITreeOptimizerConditionalGroup → VisibilityProcessor 기반으로 전환)
- Buttonsolid 통합 테스트: 삼항 분기 + compound 키에서 iconOnly 차원 제거 확인
- 전체 테스트 통과
