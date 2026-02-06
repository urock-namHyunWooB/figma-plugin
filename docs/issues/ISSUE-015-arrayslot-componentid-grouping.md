# ISSUE-015: ArraySlot componentId 기반 그룹핑

## 상태
**RESOLVED**

## 문제 설명

같은 ComponentSet의 다른 Variant들(예: Left Button(Neutral), Right Button(Primary))이 같은 ArraySlot으로 잘못 그룹핑됨.

```
예:
- Left Button: componentId=14:1665, componentSetId=14:1636
- Right Button: componentId=14:1657, componentSetId=14:1636

기존 로직: componentSetId가 같으므로 → 같은 ArraySlot으로 묶임 (잘못됨)
```

## 원인

`ArraySlotDetector.groupInstancesByComponent()`가 `componentSetId`로 그룹핑하여, 같은 ComponentSet의 서로 다른 Variant들이 하나의 ArraySlot으로 잘못 감지됨.

## 해결

`componentId`로만 그룹핑하여 정확히 같은 Variant만 ArraySlot으로 감지:

```typescript
private groupInstancesByComponent(instances: any[]): Record<string, any[]> {
  const groups: Record<string, any[]> = {};
  for (const instance of instances) {
    // componentId로 그룹핑 (정확히 같은 Variant만)
    const componentId = instance.componentId;
    const key = `componentId:${componentId}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(instance);
  }
  return groups;
}
```

## 결과

| 케이스 | 기존 (componentSetId) | 수정 (componentId) |
| ------ | -------------------- | ------------------ |
| Option 1, 2, 3 | 3개 모두 같은 ArraySlot | Option 2, 3만 ArraySlot (같은 componentId) |
| Left, Right Button | 같은 ArraySlot (잘못됨) | 별도 처리 (다른 componentId) |

## 테스트

`test/compiler/arraySlot.test.ts` - "componentId 기반 그룹핑"
