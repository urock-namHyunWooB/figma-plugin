# ISSUE-025: COMPONENT_SET 내부 TEXT 노드가 slot으로 변환되지 않음

## 상태
**RESOLVED**

## 문제 설명

COMPONENT_SET 컴포넌트의 TEXT 노드가 slot으로 변환되지 않아, 텍스트가 하드코딩되어 렌더링됨.

```
Figma 구조:
- Headersub (COMPONENT_SET)
  ├── Variant 1
  │   ├── INSTANCE (아이콘)
  │   ├── TEXT "검색"
  │   └── INSTANCE (아이콘)
  └── Variant 2
      ├── INSTANCE (아이콘)
      ├── TEXT "장바구니"
      └── INSTANCE (아이콘)

기대: INSTANCE들과 TEXT가 모두 slot으로 변환
실제: INSTANCE는 slot이지만, TEXT는 하드코딩됨
```

## 원인

1. **isComponentSetRoot 조건 불완전**: `_FinalAstTree.ts`의 `isComponentSetRoot` 변수가 astTree의 첫 번째 variant만 확인

2. **TEXT slot 변환 로직 누락**: INSTANCE는 `isExposedInstance` 체크로 slot 변환이 되지만, TEXT 노드는 별도 처리 없음

3. **originalDocument 미활용**: `specDataManager.getDocument()`로 원본 COMPONENT_SET을 가져올 수 있지만 사용하지 않음

## 해결

**1. isComponentSetRoot 조건 개선**

originalDocument까지 확인하여 COMPONENT_SET 여부를 정확히 판별:

```typescript
const rootSpec = this.specDataManager.getSpecById(astTree.id);
const originalDocument = this.specDataManager.getDocument();
const isComponentSetRoot =
  rootSpec?.type === "COMPONENT_SET" ||
  originalDocument?.type === "COMPONENT_SET";  // 추가
```

**2. TEXT 노드 slot 변환 로직 추가**

COMPONENT_SET 내부의 모든 TEXT 노드를 slot으로 변환:

```typescript
if (isComponentSetRoot && node.type === "TEXT") {
  // slot 이름 생성: TEXT 노드의 name을 camelCase로 변환
  let baseSlotName = toCamelCase(node.name) || "text";
  let slotName = baseSlotName;
  let counter = 2;
  while (collectedSlotNames.has(slotName)) {
    slotName = `${baseSlotName}${counter}`;
    counter++;
  }

  (node as any).isSlot = true;
  (node as any).slotName = slotName;
  (node as any).isTextSlot = true; // TEXT slot임을 표시
  collectedSlotNames.add(slotName);

  node.children = [];
  return;
}
```

## 결과

```tsx
// Headersub 컴포넌트
interface HeadersubProps {
  normalResponsive?: React.ReactNode;  // 왼쪽 아이콘 slot
  text?: React.ReactNode;              // 텍스트 slot
  normalResponsive2?: React.ReactNode; // 오른쪽 아이콘 slot
}

function Headersub({ normalResponsive, text, normalResponsive2 }: HeadersubProps) {
  return (
    <div css={HeadersubCss}>
      {normalResponsive || <div css={SlotPlaceholderCss}>normalResponsive</div>}
      {text || <div css={SlotPlaceholderCss}>text</div>}
      {normalResponsive2 || <div css={SlotPlaceholderCss}>normalResponsive2</div>}
    </div>
  );
}
```

## 테스트

`test/compiler/componentSetTextSlot.test.ts`
