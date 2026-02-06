# ISSUE-024: 메인과 의존성 컴포넌트 이름 충돌로 인한 무한 렌더링

## 상태
**RESOLVED**

## 문제 설명

메인 컴포넌트와 의존성 컴포넌트의 이름이 대소문자만 다른 경우 (예: "Label" vs "label"), 컴파일 후 무한 렌더링이 발생함.

```
Figma 구조:
- 메인 컴포넌트: "Label" (FRAME)
  └── 의존성: "label" (COMPONENT)

컴파일 결과:
- normalizeComponentName("Label") → "Label"
- normalizeComponentName("label") → "Label"  ← 충돌!

JSX 코드:
function Label() {
  return <div><Label /></div>;  ← 자기 자신을 호출 → 무한 재귀
}
```

## 원인

1. **컴포넌트 이름 정규화**: `normalizeComponentName()` 함수가 첫 글자를 대문자로 변환
   - "label" → "Label"
   - "Label" → "Label"

2. **이름 충돌 발생**: 메인 컴포넌트와 의존성 컴포넌트가 같은 이름으로 정규화됨

3. **JSX에서 자기 참조**: 의존성 컴포넌트 이름이 메인과 같아져서 JSX에서 자기 자신을 호출

## 해결

**DependencyManager.ts에서 이름 충돌 감지 및 해결**:

1. **충돌 감지**: 의존성 컴포넌트 이름이 메인 컴포넌트 이름과 같은지 확인

2. **이름 변경**: 충돌 시 의존성 컴포넌트 이름에 `_` 접두사 추가

3. **원본 이름 저장**: `CompiledDependency` 인터페이스에 `originalName` 필드 추가

4. **JSX 참조 치환**: 메인 컴포넌트 코드에서 원본 이름을 변경된 이름으로 치환

```typescript
// 1. CompiledDependency 인터페이스에 originalName 추가
export interface CompiledDependency {
  componentName: string;
  originalName?: string; // 충돌로 이름이 변경된 경우 원래 이름
  code: string;
  componentSetId: string;
}

// 2. compileWithDependencies: 이름 충돌 시 _ 접두사 추가
const originalDepName = normalizeComponentName(group.componentSetName);
let depComponentName = originalDepName;

if (depComponentName === componentName) {
  depComponentName = `_${depComponentName}`;
}

// 3. bundleWithDependencies: JSX 참조 치환
let finalMainCode = mainCodeWithoutImports;
for (const dep of Object.values(result.dependencies)) {
  if (dep.originalName) {
    const jsxOpenRegex = new RegExp(`<${dep.originalName}(\\s|>|/)`, "g");
    const jsxCloseRegex = new RegExp(`</${dep.originalName}>`, "g");
    finalMainCode = finalMainCode
      .replace(jsxOpenRegex, `<${dep.componentName}$1`)
      .replace(jsxCloseRegex, `</${dep.componentName}>`);
  }
}
```

## 결과

```tsx
// 의존성 컴포넌트: 이름에 _ 접두사 추가
function _Label(props) {
  return (
    <div css={_LabelCss}>
      <span css={TitleCss}>Normal</span>
    </div>
  );
}

// 메인 컴포넌트: JSX에서 _Label 참조
function Label(props) {
  return (
    <div css={LabelCss}>
      <span css={TitleCss}>Interaction</span>
      <div css={Frame960Css}>
        <_Label />  {/* 충돌 해결: 자기 자신이 아닌 의존성 호출 */}
        <_Label />
      </div>
    </div>
  );
}
```

## 테스트

`test/compiler/componentNameConflict.test.ts`
