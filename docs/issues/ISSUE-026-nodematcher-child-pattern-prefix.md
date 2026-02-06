# ISSUE-026: NodeMatcher child pattern 비교 시 prefix 매칭 미지원

## 상태
**RESOLVED**

## 문제 설명

Variant 간 자식 노드 개수가 다른 경우, 같은 노드임에도 불구하고 서로 다른 노드로 판단되어 불필요한 slot이 생성됨.

```
Figma 구조:
- Headersub (COMPONENT_SET)
  ├── Default variant
  │   ├── INSTANCE (왼쪽 아이콘)
  │   ├── TEXT "검색"
  │   └── INSTANCE (오른쪽 아이콘)  ← 3개 자식
  └── Basic variant
      ├── INSTANCE (왼쪽 아이콘)
      └── TEXT "검색"                ← 2개 자식

기대: 3개의 slot 생성 (왼쪽 아이콘, 텍스트, 오른쪽 아이콘)
실제: 4개의 slot 생성 (Basic의 노드들이 별도 slot으로 인식됨)
```

**Child pattern 비교**:
- Default variant: `"INSTANCE-TEXT-INSTANCE"` (자식 3개)
- Basic variant: `"INSTANCE-TEXT"` (자식 2개)
- 패턴이 다르므로 같은 구조로 인식되지 않음 → 매칭 실패

## 원인

`NodeMatcher._compareByStructure()` 메서드에서 child pattern 비교가 너무 엄격함:

```typescript
private _compareByStructure(nodeA: FrameNode, nodeB: FrameNode): boolean {
  const patternA = this._getChildPattern(nodeA);
  const patternB = this._getChildPattern(nodeB);

  // 패턴이 완전히 동일한 경우만 true
  if (patternA === patternB) return true;

  // ❌ prefix 관계는 고려하지 않음
  return false;
}
```

## 해결

**prefix 매칭 허용**:

한 패턴이 다른 패턴의 prefix인 경우 같은 구조로 판단:

```typescript
private _compareByStructure(nodeA: FrameNode, nodeB: FrameNode): boolean {
  const patternA = this._getChildPattern(nodeA);
  const patternB = this._getChildPattern(nodeB);

  // 패턴이 완전히 동일하면 true
  if (patternA === patternB) return true;

  // 한 패턴이 다른 패턴의 prefix인 경우 true (variant간 자식 수가 다른 경우 허용)
  // 예: "INSTANCE-TEXT-INSTANCE" vs "INSTANCE-TEXT" → "INSTANCE-TEXT"가 prefix이므로 true
  if (patternA.startsWith(patternB) || patternB.startsWith(patternA)) {
    return true;
  }

  return false;
}
```

## 결과

```tsx
// Headersub 컴포넌트
interface HeadersubProps {
  normalResponsive?: React.ReactNode;  // 왼쪽 아이콘 slot
  text?: React.ReactNode;              // 텍스트 slot
  normalResponsive2?: React.ReactNode; // 오른쪽 아이콘 slot (optional)
}

// 3개의 slot만 생성됨 ✓
function Headersub({ normalResponsive, text, normalResponsive2 }: HeadersubProps) {
  return (
    <div css={HeadersubCss}>
      {normalResponsive}
      {text}
      {normalResponsive2}  {/* Basic variant에서는 없음 */}
    </div>
  );
}
```

## 테스트

`test/compiler/nodeMatherChildPattern.test.ts`
