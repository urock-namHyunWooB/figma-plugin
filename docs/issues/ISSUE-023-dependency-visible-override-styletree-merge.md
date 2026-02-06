# ISSUE-023: Dependency에서 visible override가 있는 INSTANCE의 styleTree 병합 누락

## 상태
**RESOLVED**

## 문제 설명

Case 컴포넌트의 Pressed 버튼이 Figma 원본과 다르게 렌더링됨:

```
Figma 원본 (Pressed 버튼):
- Decorateinteractive 오버레이 표시됨
- width: 343px
- opacity: 0.24

잘못된 렌더링:
- Decorateinteractive 오버레이가 보이지 않음 (브라우저 기본 흰 배경)
- width: 83px (잘못됨)
- opacity: 0.08 (잘못됨)
```

## 원인

**1. Dependency 루트 배경색 누락**

`VariantEnrichManager.makeRootFlexible()`이 dependency 루트에서 background를 제거하여 투명도가 있는 Decorateinteractive 아래로 브라우저 기본 배경(흰색)이 노출됨.

**2. visible override가 있을 때 styleTree 병합 누락**

`InstanceOverrideManager.enrichVariantWithStyleTreeOnly()`에서 `hasHiddenChildren`이 true이면 styleTree 병합을 완전히 건너뛰어, Decorateinteractive의 크기와 opacity override가 적용되지 않음.

**3. INSTANCE 선택 시 visible override 우선순위 누락**

`DependencyManager`에서 dependency를 컴파일할 때 variant 중 첫 번째 INSTANCE를 무조건 선택하여, visible override가 있는 INSTANCE의 스타일이 반영되지 않음.

## 해결

**1. `VariantEnrichManager.makeRootFlexible()`: transparent 배경 및 relative 위치 추가**

```typescript
// transparent 배경 추가 - 브라우저 기본 배경 방지
const backgroundStyle = { background: "transparent" };

// absolute 자식이 있으면 position: relative 추가
const hasAbsoluteChild = Object.values(variant.children || {}).some(
  (child) => child?.styleTree?.cssStyle?.position === "absolute"
);
const positionStyle = hasAbsoluteChild ? { position: "relative" as const } : {};
```

**2. `InstanceOverrideManager.enrichVariantWithStyleTreeOnly()`: children 유지하면서 styleTree만 병합**

```typescript
public enrichVariantWithStyleTreeOnly(
  variant: FigmaNodeData,
  instanceNode: FigmaNodeData
): FigmaNodeData {
  const instanceOverrides = this.extractOverrides(variant, instanceNode);

  // hasHiddenChildren여도 styleTree는 병합 (크기, opacity 등)
  const mergedVariant = this.variantEnrichManager.mergeInstanceOverrides(
    variant,
    instanceOverrides.styleTree
  );

  // children은 원본 variant의 children 유지 (visible override 반영 안함)
  return {
    ...mergedVariant,
    children: variant.children,
  };
}
```

**3. `DependencyManager`: visible override가 있는 INSTANCE 우선 선택**

```typescript
private _getRepresentativeInstanceNode(
  variantInstances: Record<string, FigmaNodeData>
): FigmaNodeData {
  const instances = Object.values(variantInstances);

  // 1순위: visible override가 있는 INSTANCE
  const visibleOverrideInstance = instances.find((inst) => {
    const overrides = inst.metaData?.overrides || [];
    return overrides.some((ov) => ov.overriddenFields?.includes("visible"));
  });

  if (visibleOverrideInstance) {
    return visibleOverrideInstance;
  }

  // 2순위: 첫 번째 INSTANCE
  return instances[0];
}
```

## 결과

| 항목 | 기존 | 수정 후 | 상태 |
|------|------|---------|------|
| Decorateinteractive 배경 | 흰색 (브라우저 기본) | 검은색 (opacity: 0.24) | ✓ |
| width | 83px | 343px | ✓ |
| opacity | 0.08 | 0.24 | ✓ |
| position | relative | absolute (부모는 relative) | ✓ |

## 테스트

`test/compiler/caseVisibleOverride.test.ts`
