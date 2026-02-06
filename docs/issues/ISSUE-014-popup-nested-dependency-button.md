# ISSUE-014: Popup 컴포넌트 내부 버튼 렌더링 안됨

## 상태
**RESOLVED**

## 문제 설명

복잡한 중첩 구조의 Popup 컴포넌트에서 하위 dependency 컴포넌트(Popupbottom) 내부의 버튼(Large)이 렌더링되지 않음.

```
Figma 원본:
┌─────────────────────────────┐
│ Location services turned off│
│ Turn on location services...│
│ [이미지]                     │
│ ┌─────────────────────────┐ │
│ │      Confirm (파란버튼)   │ │  ← 렌더링 안됨
│ └─────────────────────────┘ │
└─────────────────────────────┘

잘못된 렌더링:
- Popupbottom 컴포넌트가 {children}만 렌더링
- Large 버튼 컴포넌트가 누락됨
```

## 원인

4가지 문제가 복합적으로 발생:

**1. 중첩 dependency INSTANCE 검색 실패**

`InstanceOverrideManager.findInstanceNodeForComponentId()`가 메인 document만 검색하여 dependency document 내부의 INSTANCE를 찾지 못함.

**2. visible:false INSTANCE가 ArraySlot으로 감지됨**

Left Button(`visible: false`)과 Right Button이 같은 ComponentSet을 참조하여 2개 이상으로 인식, ArraySlot으로 잘못 감지됨.

**3. I... 노드가 삭제됨**

`updateCleanupNodes`에서 I... ID를 가진 노드가 삭제되는데, dependency가 있는 INSTANCE 노드도 함께 삭제됨.

**4. _enrichedFromEmptyChildren 플래그 미설정**

`enrichVariantWithInstanceChildren()` 호출 시 원래 children이 비어있을 때만 플래그 설정. 하지만 children이 있어도 I... ID로 교체되면 플래그가 필요함.

## 해결

**1. InstanceOverrideManager - dependency document 검색 추가**

```typescript
public findInstanceNodeForComponentId(componentId: string): any | null {
  // 1. 메인 document에서 먼저 검색
  const foundInMain = traverse(document);
  if (foundInMain) return foundInMain;

  // 2. 메인에서 못 찾으면 dependency documents에서 검색
  const dependencies = this.specDataManager.getDependencies();
  if (dependencies) {
    for (const depData of Object.values(dependencies)) {
      const depDocument = (depData as any)?.info?.document;
      if (depDocument) {
        const foundInDep = traverse(depDocument);
        if (foundInDep) return foundInDep;
      }
    }
  }
  return null;
}
```

**2. ArraySlotDetector - visible:false INSTANCE 제외**

```typescript
// INSTANCE 타입이면서 visible: false가 아닌 children만 필터링
const instances = children.filter(
  (child: any) => child.type === "INSTANCE" && child.visible !== false
);
```

**3. _FinalAstTree - dependency INSTANCE 노드 보존**

```typescript
if (isInstanceChild && !isRootInstance && !enrichedFromEmptyChildren) {
  // INSTANCE 타입이고 dependency에 있는 componentId를 참조하면 유지
  const nodeSpec = this.specDataManager.getSpecById(node.id);
  const componentId = (nodeSpec as any)?.componentId;
  const dependencies = this.specDataManager.getDependencies();
  const hasDependency = componentId && dependencies && dependencies[componentId];

  if (!hasDependency) {
    nodesToRemove.push(node);
  }
}
```

**4. DependencyManager - 플래그 항상 설정**

```typescript
} else {
  // 오버라이드가 없으면 INSTANCE children을 그대로 사용
  enrichedVariant = this.instanceOverrideManager.enrichVariantWithInstanceChildren(
    enrichedVariant,
    instanceNode
  );

  // INSTANCE children (I... ID)을 사용하므로 플래그 설정
  // 이 플래그가 있으면 updateCleanupNodes에서 I... 노드가 삭제되지 않음
  (enrichedVariant as any)._enrichedFromEmptyChildren = true;
}
```

## 테스트

`test/compiler/popupNestedDependency.test.ts`
