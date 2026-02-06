# ISSUE-016: SuperTree 병합 후 ArraySlot parentId 불일치

## 상태
**RESOLVED**

## 문제 설명

ArraySlot의 `parentId`가 원본 Figma variant 노드 ID인데, AST는 병합된 SuperTree에서 생성되어 ID가 불일치. `.map()` 렌더링이 생성되지 않음.

```
예:
- ArraySlot parentId: 133:791 (variant "Size=default, Options=3 options")
- AST root ID: 133:737 (대표 variant "Size=default, Options=2 options")

CreateJsxTree에서 arraySlotByParentId.get(133:737)
→ undefined (133:791만 등록됨)
→ .map() 렌더링 생성 안됨
```

## 원인

1. `ArraySlotDetector`가 원본 Figma variant 노드 ID를 `parentId`로 저장
2. `CreateSuperTree`가 여러 variant를 하나의 AST로 병합, 대표 variant의 ID 사용
3. `CreateJsxTree._createChildren()`에서 `parentId` 매칭 실패

## 해결

`CreateJsxTree._findArraySlotForNode()`에서 children ID로 매칭:

```typescript
private _findArraySlotForNode(node: FinalAstTree): ArraySlot | undefined {
  // 1. parentId로 직접 매칭 (기존 로직)
  const directMatch = this.arraySlotByParentId.get(node.id);
  if (directMatch) {
    return directMatch;
  }

  // 2. children의 ID로 매칭
  for (const slot of this.arraySlots) {
    const instanceIds = new Set(slot.instances.map((i) => i.id));

    for (const child of node.children) {
      if (instanceIds.has(child.id)) {
        return slot;
      }

      // externalComponent의 componentId로도 확인
      if (child.externalComponent) {
        const extCompId = child.externalComponent.componentId;
        if (slot.componentId && extCompId === slot.componentId) {
          return slot;
        }
      }
    }
  }

  return undefined;
}
```

## 결과

```jsx
// 이전: 조건부 렌더링 (각 variant별)
{size === "default" && options === "3 options" && (
  <>
    <SelectButton selected="true" labelText="Option 2" />
    <SelectButton selected="true" labelText="Option 3" />
  </>
)}

// 이후: .map() 렌더링
{options.map((item, index) => (
  <div key={index} style={{ height: "24px", flex: "1 0 88px" }}>
    <SelectButton size={item.size} selected={item.selected} text={item.text} />
  </div>
))}
```

## 테스트

`test/compiler/arraySlot.test.ts` - "SuperTree 병합 ID 매칭"
