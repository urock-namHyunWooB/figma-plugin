# ISSUE-034: ConfirmationDialog 버튼 텍스트 오버라이드 버그

## 상태
**RESOLVED**

## 문제 설명

ConfirmationDialog 컴포넌트에서 Cancel 버튼과 Confirm 버튼이 있는데, 두 버튼의 텍스트가 올바르게 표시되지 않음.

### 컴포넌트 구조
```
ConfirmationDialog
├── Cancel 버튼 (Button INSTANCE, variant="secondary")
│   └── TEXT: "Cancel"
└── Confirm 버튼 (Button= INSTANCE, variant="primary")
    └── TEXT: "Confirm"
```

### 증상
1. **텍스트 오버라이드 실패**: 두 버튼 모두 "Cancel"로 표시되거나 Confirm 버튼 텍스트가 표시되지 않음
2. **텍스트 색상 오류**: Confirm 버튼(primary variant)의 텍스트가 검정색으로 표시됨 (흰색이어야 함)

### 예상 결과 vs 실제 결과
```tsx
// 예상: 각 버튼이 다른 텍스트를 표시
<Button variant="secondary" secondaryText="Cancel" />
<Button variant="primary" labelText="Confirm" />

// 실제: 같은 텍스트를 표시하거나 텍스트 누락
<Button variant="secondary" secondaryText="Cancel" />
<Button variant="primary" labelText="Cancel" />  // 잘못된 텍스트
```

---

## 원인 분석

### 원인 1: 대표 variant만 컴파일
`DependencyManager`가 COMPONENT_SET의 모든 variant를 컴파일하지 않고, 하나의 대표 variant(예: secondary)만 선택하여 컴파일함.

```typescript
// 문제: secondary variant만 컴파일
Button (COMPONENT_SET)
├── variant="secondary"  ← 이것만 컴파일
│   └── TEXT: "Secondary"
└── variant="primary"    ← 무시됨
    └── TEXT: "Label"
```

결과: secondary variant의 TEXT 노드 "Secondary"만 렌더링되고, primary variant의 TEXT 노드 "Label"은 prop으로 추출되지 않음.

### 원인 2: 이름 기반 prop 매칭
TEXT 노드와 prop을 매칭할 때 `nodeId`로 정확히 매칭하지 않고, 노드 이름으로만 매칭함.

```typescript
// 문제: 이름만으로 매칭
const propDef = overrideableProps.find(p => p.name === "Secondary");
// 노드 ID가 다른데도 같은 prop을 사용
```

결과: variant에 따라 다른 TEXT 노드인데도 같은 prop을 바인딩하여 텍스트가 중복됨.

### 원인 3: variant별 CSS 스타일 미적용
variant에 따라 TEXT 노드의 색상이 다른데 (primary는 흰색, secondary는 회색), 조건부로 스타일을 적용하지 않음.

```typescript
// 문제: 모든 variant에서 같은 색상
<span css={SecondaryCss}>
  {secondaryText}
</span>

// 필요: variant별 조건부 스타일
<span
  css={SecondaryCss}
  style={variant === "primary" ? { color: "#FFF" } : undefined}
>
  {variant === "primary" ? labelText : secondaryText}
</span>
```

---

## 해결 방법

### 해결 1: PropDefinition에 메타데이터 추가

**수정 파일**: `src/frontend/ui/domain/code-generator/types/architecture.ts`

```typescript
export interface PropDefinition {
  name: string;
  type: "string" | "boolean" | "number" | "React.ReactNode";
  defaultValue?: string | boolean | number;

  // 추가: TEXT 노드 오버라이드 매칭을 위한 메타데이터
  nodeId?: string;           // 원본 노드 ID
  nodeName?: string;         // 원본 노드 이름
  variantValue?: string;     // variant 값 (예: "primary", "secondary")
  cssStyle?: {               // variant별 CSS 스타일
    [key: string]: string | number;
  };
}
```

**핵심 변경사항**:
- `nodeId`: TEXT 노드를 정확히 매칭하기 위한 ID
- `nodeName`: 폴백 매칭을 위한 이름
- `variantValue`: 어떤 variant의 prop인지 식별
- `cssStyle`: variant별 inline style (색상 등)

---

### 해결 2: DependencyManager에서 메타데이터 수집

**수정 파일**: `src/frontend/ui/domain/code-generator/manager/DependencyManager.ts`

```typescript
private _collectAllOverrideableProps(
  spec: FigmaNodeSpec,
  allVariantSpecs: FigmaNodeSpec[]
): Map<string, PropDefinition> {
  const propsMap = new Map<string, PropDefinition>();

  for (const variantSpec of allVariantSpecs) {
    // variant 이름에서 값 추출 (예: "variant=primary" → "primary")
    const variantValue = this._extractVariantValueFromName(variantSpec.name);

    this._traverse(variantSpec, (child) => {
      // TEXT 오버라이드 수집
      if (child.type === "TEXT" && child.overrides?.characters) {
        const cssStyle = this._extractCssStyleFromText(child);

        propsMap.set(child.id, {
          name: this._toCamelCase(child.name) + "Text",
          type: "string",
          defaultValue: child.characters,
          nodeId: child.id,            // 추가
          nodeName: child.name,        // 추가
          variantValue: variantValue,  // 추가
          cssStyle: cssStyle,          // 추가
        });
      }
    });
  }

  return propsMap;
}

// variant 이름 파싱 헬퍼
private _extractVariantValueFromName(name: string): string | undefined {
  // "variant=primary, size=large" → "primary"
  const match = name.match(/variant=([^,]+)/);
  return match ? match[1].trim() : undefined;
}
```

**핵심 변경사항**:
1. 모든 variant를 순회하며 TEXT 오버라이드 수집
2. 각 TEXT 노드의 `nodeId`, `nodeName`, `variantValue`, `cssStyle` 저장
3. variant 값을 이름에서 추출하여 저장

---

### 해결 3: PropsProcessor에서 정확한 prop 바인딩

**수정 파일**: `src/frontend/ui/domain/code-generator/core/tree-builder/workers/PropsProcessor.ts`

```typescript
static bindProps(
  node: InternalNode,
  overrideableProps: PropDefinition[],
  ctx: BuildContext
): void {
  if (node.type === "TEXT" && node.mergedNode.length > 0) {
    // 1차: nodeId로 정확히 매칭
    const propByNodeId = this.findPropByNodeId(
      node.mergedNode[0].id,
      overrideableProps
    );

    if (propByNodeId) {
      node.textProp = propByNodeId;
      return;
    }

    // 2차: nodeName으로 폴백 매칭
    const originalNode = ctx.data.getNodeById(node.mergedNode[0].id);
    if (originalNode) {
      const propByNodeName = this.findPropByNodeName(
        originalNode.name || "",
        overrideableProps
      );

      if (propByNodeName) {
        node.textProp = propByNodeName;
        return;
      }
    }
  }

  // 자식 노드 재귀 처리
  for (const child of node.children) {
    this.bindProps(child, overrideableProps, ctx);
  }
}

// nodeId로 prop 찾기
private static findPropByNodeId(
  nodeId: string,
  props: PropDefinition[]
): PropDefinition | undefined {
  return props.find(p => p.nodeId === nodeId);
}

// nodeName으로 prop 찾기 (폴백)
private static findPropByNodeName(
  nodeName: string,
  props: PropDefinition[]
): PropDefinition | undefined {
  return props.find(p => p.nodeName === nodeName);
}
```

**핵심 변경사항**:
1. TEXT 노드를 prop과 매칭할 때 `nodeId`로 우선 매칭
2. 매칭 실패 시 `nodeName`으로 폴백 매칭
3. 정확한 1:1 매칭으로 텍스트 중복 방지

---

### 해결 4: ComponentGenerator에서 조건부 렌더링

**수정 파일**: `src/frontend/ui/domain/code-generator/core/code-emitter/generators/ComponentGenerator.ts`

```typescript
// TEXT 노드 렌더링 시 조건부 표현식 생성
private createConditionalTextExpression(
  node: DesignNode,
  tree: DesignTree
): string | undefined {
  if (!node.textProp) return undefined;

  // 같은 prop name을 가진 다른 variant의 prop 찾기
  const allTextProps = this.findAllTextPropsWithSameName(
    node.textProp.name,
    tree
  );

  if (allTextProps.length <= 1) {
    // 단일 prop: 그냥 사용
    return `{${node.textProp.name}}`;
  }

  // 복수 prop: variant에 따라 조건부 렌더링
  // {variant === "primary" ? labelText : secondaryText}
  return this.generateConditionalExpression(allTextProps);
}

// variant별 조건부 inline style 생성
private createConditionalStyleAttribute(
  node: DesignNode,
  tree: DesignTree
): string | undefined {
  if (!node.textProp?.cssStyle) return undefined;

  const allTextProps = this.findAllTextPropsWithSameName(
    node.textProp.name,
    tree
  );

  if (allTextProps.length <= 1) return undefined;

  // variant에 따라 다른 스타일 적용
  // style={variant === "primary" ? { color: "#FFF" } : undefined}
  const conditions = allTextProps
    .filter(p => p.variantValue && p.cssStyle)
    .map(p => `variant === "${p.variantValue}" ? ${JSON.stringify(p.cssStyle)} : undefined`)
    .join(" : ");

  return `style={${conditions}}`;
}
```

**핵심 변경사항**:
1. 같은 이름의 prop이 여러 variant에 존재하면 조건부 렌더링
2. variant prop 값에 따라 다른 텍스트와 스타일 적용
3. inline style로 variant별 색상 차이 구현

---

## 최종 결과

### 생성된 Button 컴포넌트 Props
```typescript
interface ButtonProps {
  variant?: "primary" | "secondary";
  secondaryText?: string;  // secondary variant의 TEXT
  labelText?: string;      // primary variant의 TEXT
}
```

### 생성된 Button 컴포넌트 렌더링
```tsx
function Button({ variant = "secondary", secondaryText, labelText }: ButtonProps) {
  return (
    <div css={ButtonCss}>
      <span
        css={SecondaryCss}
        style={variant === "primary" ? { color: "var(--White, #FFF)" } : undefined}
      >
        {variant === "primary" ? labelText : secondaryText}
      </span>
    </div>
  );
}
```

### ConfirmationDialog 사용
```tsx
function ConfirmationDialog() {
  return (
    <div>
      <Button variant="secondary" secondaryText="Cancel" />
      <Button variant="primary" labelText="Confirm" />
    </div>
  );
}
```

---

## 수정 파일 목록

| 파일 | 변경 내용 |
|------|----------|
| `types/architecture.ts` | PropDefinition에 nodeId, nodeName, variantValue, cssStyle 추가 |
| `manager/DependencyManager.ts` | _collectAllOverrideableProps에서 메타데이터 수집, _extractVariantValueFromName 추가 |
| `core/data-preparer/DataPreparer.ts` | mergeOverrideableProps에서 메타데이터 전달 |
| `core/tree-builder/workers/PropsProcessor.ts` | extractProps에서 메타데이터 보존, bindProps에서 nodeId 매칭, findPropByNodeId/findPropByNodeName 추가 |
| `core/tree-builder/TreeBuilder.ts` | buildNonComponentSet에 PropsProcessor.bindProps 호출 추가 |
| `core/code-emitter/generators/ComponentGenerator.ts` | createConditionalTextExpression, createConditionalStyleAttribute 추가 |

---

## 테스트

**테스트 파일**: `test/compiler/confirmationDialogTextOverride.test.ts`

```typescript
describe("ConfirmationDialog 버튼 텍스트 오버라이드", () => {
  it("Cancel 버튼과 Confirm 버튼이 각각 다른 텍스트를 가져야 한다", async () => {
    // Cancel 버튼 (secondary variant)의 secondaryText prop 확인
    expect(result).toMatch(/secondaryText="Cancel"/);

    // Confirm 버튼 (primary variant)의 labelText prop 확인
    expect(result).toMatch(/labelText="Confirm"/);
  });

  it("Button 컴포넌트가 text override props를 가져야 한다", async () => {
    // Button Props 인터페이스에 text override props 확인
    expect(result).toMatch(/interface ButtonProps/);
    expect(result).toMatch(/secondaryText\?:\s*string/);
    expect(result).toMatch(/labelText\?:\s*string/);
  });

  it("Button 컴포넌트 내부에서 text prop이 TEXT 노드에 바인딩되어야 한다", async () => {
    // Button 컴포넌트 내부에서 variant에 따라 조건부로 텍스트 렌더링
    expect(result).toMatch(/variant\s*===\s*"primary"\s*\?\s*labelText\s*:\s*secondaryText/);
  });
});
```

**테스트 결과**: PASS (3 tests)

---

## 관련 이슈

- ISSUE-009: INSTANCE override CSS 변수 처리
- ISSUE-014: Popup 중첩 dependency 처리
- ISSUE-033: Primary 버튼 렌더링 (variant별 스타일 분류)
