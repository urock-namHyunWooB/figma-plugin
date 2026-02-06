# ISSUE-031: CSS 변환 불가능한 State prop 보존

## 상태
**RESOLVED**

## 문제 설명

State prop 값 중 CSS pseudo-class로 변환할 수 없는 값들("Insert", "Error" 등)이 있는 경우, State prop이 삭제되어 조건부 렌더링이 동작하지 않음.

```
Figma 구조:
- InputBoxstandard (COMPONENT_SET)
  ├── State=Normal
  ├── State=Insert  ← CSS 변환 불가
  └── State=Error   ← CSS 변환 불가

기대: state prop 유지, 조건부 렌더링 동작
실제: state prop 삭제됨 → 조건부 렌더링 실패
```

## 원인

`_FinalAstTree._convertStatePropToPseudo()`에서 모든 State 값이 CSS로 변환 가능한지 확인하지 않고 prop을 삭제:

```typescript
// 기존 로직
if (statePropName) {
  // CSS 변환 가능 여부와 관계없이 prop 삭제
  delete astTree.props[statePropName];
}
```

**문제 케이스**: `["Insert", "Error"].includes(props.state)` 조건이 있는 경우
- `state` prop이 삭제되면 조건이 항상 undefined와 비교됨
- 조건부 렌더링이 동작하지 않음

## 해결

**배열 형태 조건에서 CSS 변환 불가능한 값 감지**:

```typescript
// ["..."].includes(props.state) 패턴 감지
const stateIncludesPattern = new RegExp(
  `\\["[^"]*"(?:,\\s*"[^"]*")*\\]\\.includes\\(props\\.${statePropName}\\)`,
  "g"
);

// 배열 내 값들 추출
const matches = conditionStr.matchAll(stateIncludesPattern);
for (const match of matches) {
  const extractedValues = match[0].match(/"([^"]+)"/g)?.map((s) => s.replace(/"/g, "")) || [];

  // CSS 변환 불가능한 값 확인
  const hasUnresolvable = extractedValues.some(
    (val) => STATE_TO_PSEUDO[val] === undefined
  );

  if (hasUnresolvable) {
    // "Insert", "Error" 등 포함 → state prop 유지
    hasUnresolvableStateCondition = true;
  } else {
    // 모두 CSS 변환 가능 → visible: true
    node.visible = { type: "static", value: true };
  }
}

// state prop 삭제 여부 결정
if (statePropName && !hasUnresolvableStateCondition) {
  delete astTree.props[statePropName];
}
```

## 결과

```typescript
// state prop 유지됨
type InputBoxstandardProps = {
  state: "Normal" | "Insert" | "Error";
};

function InputBoxstandard({ state }: InputBoxstandardProps) {
  return (
    <div>
      {["Insert", "Error"].includes(state) && <div>...</div>}  {/* ✓ 정상 동작 */}
    </div>
  );
}
```

## 테스트

`test/compiler/inputBoxStandard-visibility.test.ts`
